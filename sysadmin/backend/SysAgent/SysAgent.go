package sysagent

import (
	"bufio"
	"crypto/ed25519"
	"crypto/rand"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/ssh"
)

// ========== КОНСТАНТЫ ==========
const (
	TCPPort            = 65432
	UDPPort            = 65433
	ShellPort          = 65434
	MaxHistoryPoints   = 60
	sshPort            = "22"
	sshReadyTimeout    = 3 * time.Minute
	defaultSshUsername = "sysadmin"
)

// ========== СТРУКТУРЫ ДАННЫХ ==========

// Metrics — то, что присылает агент
type Metrics struct {
	Hostname       string                   `json:"hostname"`
	CPUPercent     float64                  `json:"cpu_percent"`
	RAMPercent     float64                  `json:"ram_percent"`
	GPUPercent     float64                  `json:"gpu_percent"`
	CPUModel       string                   `json:"cpu_model"`
	CPUTemp        string                   `json:"cpu_temp"`
	RAMTotal       float64                  `json:"ram_total"`
	GPUModel       string                   `json:"gpu_model"`
	GPUTemp        string                   `json:"gpu_temp"`
	Disks          []map[string]interface{} `json:"disks"`
	NetInterfaces  map[string]interface{}   `json:"network"`
	Processes      []map[string]interface{} `json:"processes"`
	SSHSetupResult *sshSetupResult          `json:"ssh_setup_result,omitempty"`
}

type sshSetupResult struct {
	RequestID string `json:"request_id"`
	Success   bool   `json:"success"`
	Error     string `json:"error"`
}

type sshSetupRequest struct {
	RequestID string `json:"request_id"`
	Username  string `json:"username"`
	PublicKey string `json:"public_key"`
}

// DeviceInfo — хранит последние данные и IP устройства
type DeviceInfo struct {
	IP      string  `json:"ip"`
	Metrics Metrics `json:"metrics"`
}

type shellHandshake struct {
	Hostname string `json:"hostname"`
}

type shellRequest struct {
	Command string `json:"command"`
}

type shellResponse struct {
	Output string `json:"output"`
}

type remoteShellSession struct {
	conn      net.Conn
	encoder   *json.Encoder
	responses chan shellResponse
	done      chan struct{}
	mu        sync.Mutex
}

type SSHSessionUpdate struct {
	Output  string `json:"output"`
	Running bool   `json:"running"`
	Error   string `json:"error"`
}

type sshTerminalSession struct {
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	mu      sync.Mutex
	inputMu sync.Mutex
	output  []byte
	done    chan struct{}
	waitErr error
}

func (session *sshTerminalSession) Write(data []byte) (int, error) {
	session.mu.Lock()
	defer session.mu.Unlock()

	const maxOutputBytes = 1024 * 1024
	session.output = append(session.output, data...)
	if len(session.output) > maxOutputBytes {
		session.output = append([]byte(nil), session.output[len(session.output)-maxOutputBytes:]...)
	}
	return len(data), nil
}

func (session *sshTerminalSession) readUpdate() SSHSessionUpdate {
	session.mu.Lock()
	output := string(session.output)
	session.output = nil
	session.mu.Unlock()

	update := SSHSessionUpdate{Output: output, Running: true}
	select {
	case <-session.done:
		update.Running = false
		session.mu.Lock()
		waitErr := session.waitErr
		session.mu.Unlock()
		if waitErr != nil {
			update.Error = waitErr.Error()
		}
	default:
	}
	return update
}

func (session *remoteShellSession) execute(command string) (string, error) {
	session.mu.Lock()
	defer session.mu.Unlock()

	if err := session.conn.SetDeadline(time.Now().Add(20 * time.Second)); err != nil {
		return "", err
	}
	defer session.conn.SetDeadline(time.Time{})

	if err := session.encoder.Encode(shellRequest{Command: command}); err != nil {
		return "", fmt.Errorf("send remote command: %w", err)
	}

	timer := time.NewTimer(20 * time.Second)
	defer timer.Stop()
	select {
	case response := <-session.responses:
		return response.Output, nil
	case <-session.done:
		return "", fmt.Errorf("remote shell connection closed")
	case <-timer.C:
		return "", fmt.Errorf("remote command timed out")
	}
}

// History — хранит историю метрик для графиков
type History struct {
	CPU  []float64 `json:"cpu"`
	RAM  []float64 `json:"ram"`
	GPU  []float64 `json:"gpu"`
	Time []int64   `json:"time"` // порядковый номер (1,2,3...)
}

// ========== ОСНОВНАЯ СТРУКТУРА ==========

// SysAgent — ядро сервера
type SysAgent struct {
	mu       sync.RWMutex
	devices  map[string]DeviceInfo
	history  map[string]*History
	commands map[string]string // команды, ожидающие отправки агенту
	stopChan chan struct{}
	tcpLn    net.Listener
	udpConn  *net.UDPConn

	shellMu         sync.RWMutex
	shellLn         net.Listener
	shellSessions   map[string]*remoteShellSession
	sshMu           sync.RWMutex
	sshSessions     map[string]*sshTerminalSession
	sshSetupWaiters map[string]chan sshSetupResult
	sshSetupMu      sync.Mutex
	sshKeyMu        sync.Mutex
	startOnce       sync.Once
	stopOnce        sync.Once
}

// New — конструктор
func New() *SysAgent {
	return &SysAgent{
		devices:         make(map[string]DeviceInfo),
		history:         make(map[string]*History),
		commands:        make(map[string]string),
		stopChan:        make(chan struct{}),
		shellSessions:   make(map[string]*remoteShellSession),
		sshSessions:     make(map[string]*sshTerminalSession),
		sshSetupWaiters: make(map[string]chan sshSetupResult),
	}
}

// ========== ЗАПУСК / ОСТАНОВ ==========

// Start запускает TCP и UDP серверы
func (s *SysAgent) Start() {
	s.startOnce.Do(func() {
		go s.runTCPServer()
		go s.runUDPServer()
		go s.runShellServer()
		log.Println("SysAgent: TCP, UDP и remote shell серверы запущены")
	})
}

// Stop останавливает серверы (graceful shutdown)
func (s *SysAgent) Stop() {
	s.stopOnce.Do(func() {
		close(s.stopChan)
		if s.tcpLn != nil {
			s.tcpLn.Close()
		}
		if s.udpConn != nil {
			s.udpConn.Close()
		}

		s.shellMu.Lock()
		if s.shellLn != nil {
			s.shellLn.Close()
		}
		for hostname, session := range s.shellSessions {
			session.conn.Close()
			delete(s.shellSessions, hostname)
		}
		s.shellMu.Unlock()

		s.sshMu.Lock()
		for sessionID, session := range s.sshSessions {
			session.stdin.Close()
			if session.cmd.Process != nil {
				session.cmd.Process.Kill()
			}
			delete(s.sshSessions, sessionID)
		}
		s.sshMu.Unlock()
		log.Println("SysAgent: остановлен")
	})
}

// ========== TCP СЕРВЕР (приём метрик) ==========

func (s *SysAgent) runTCPServer() {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", TCPPort))
	if err != nil {
		log.Printf("TCP listen error: %v", err)
		return
	}
	s.tcpLn = ln
	for {
		select {
		case <-s.stopChan:
			return
		default:
			conn, err := ln.Accept()
			if err != nil {
				continue
			}
			go s.handleTCPConn(conn)
		}
	}
}

func (s *SysAgent) StartSSHSessionByHostname(hostname string) (string, error) {
	s.mu.RLock()

	device, ok := s.devices[hostname]
	s.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("устройство %q не найдено", hostname)
	}
	if device.IP == "" {
		return "", fmt.Errorf("у устройства %q нет IP-адреса", hostname)
	}

	privateKeyPath, publicKey, err := s.ensureSSHKey()
	if err != nil {
		return "", err
	}
	if err := s.configureSSH(hostname, defaultSshUsername, publicKey, sshReadyTimeout); err != nil {
		return "", err
	}

	address := net.JoinHostPort(device.IP, sshPort)
	if err := waitForTCPPort(address, 15*time.Second); err != nil {
		return "", fmt.Errorf("SSH настроен, но TCP/22 на устройстве %q недоступен: %w", hostname, err)
	}

	host := device.IP
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	target := defaultSshUsername + "@" + host
	return s.startSSHProcess(target, privateKeyPath)
}

// StartSSHSessionByIP starts an SSH session to the given IP address.
// It assumes SSH is already configured on the target (public key in ~/.ssh/authorized_keys)
// and does not attempt to configure SSH via the agent.
func (s *SysAgent) StartSSHSessionByIP(ip string, sshUsername string) (string, error) {
	if ip == "" {
		return "", fmt.Errorf("IP address cannot be empty")
	}
	address := net.JoinHostPort(ip, sshPort)
	if err := waitForTCPPort(address, 15*time.Second); err != nil {
		return "", fmt.Errorf("TCP/22 на устройстве %q недоступен: %w", ip, err)
	}
	host := ip
	if strings.Contains(host, ":") {
		host = "[" + host + "]"
	}
	target := sshUsername + "@" + host
	return s.startSSHProcess(target, "") // пустой путь: ssh сам берёт ключи из ~/.ssh
}

func (s *SysAgent) ensureSSHKey() (string, string, error) {
	s.sshKeyMu.Lock()
	defer s.sshKeyMu.Unlock()

	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", "", fmt.Errorf("find application config directory for SSH key: %w", err)
	}
	keyDir := filepath.Join(configDir, "SysAdmin", "ssh")
	if err := os.MkdirAll(keyDir, 0o700); err != nil {
		return "", "", fmt.Errorf("create SSH key directory: %w", err)
	}
	if err := os.Chmod(keyDir, 0o700); err != nil {
		return "", "", fmt.Errorf("secure SSH key directory: %w", err)
	}

	privateKeyPath := filepath.Join(keyDir, "id_ed25519")
	publicKeyPath := privateKeyPath + ".pub"
	privateKey, privateErr := os.ReadFile(privateKeyPath)
	publicKeyBytes, publicErr := os.ReadFile(publicKeyPath)

	if privateErr != nil && !os.IsNotExist(privateErr) {
		return "", "", fmt.Errorf("read SSH private key: %w", privateErr)
	}
	if publicErr != nil && !os.IsNotExist(publicErr) {
		return "", "", fmt.Errorf("read SSH public key: %w", publicErr)
	}
	if os.IsNotExist(privateErr) && os.IsNotExist(publicErr) {
		publicKey, privateKeyBytes, err := ed25519.GenerateKey(rand.Reader)
		if err != nil {
			return "", "", fmt.Errorf("generate SSH key: %w", err)
		}
		privateKeyPEM, err := ssh.MarshalPrivateKey(privateKeyBytes, "SysAdmin managed SSH key")
		if err != nil {
			return "", "", fmt.Errorf("encode SSH private key: %w", err)
		}
		sshPublicKey, err := ssh.NewPublicKey(publicKey)
		if err != nil {
			return "", "", fmt.Errorf("encode SSH public key: %w", err)
		}
		if err := os.WriteFile(privateKeyPath, pem.EncodeToMemory(privateKeyPEM), 0o600); err != nil {
			return "", "", fmt.Errorf("save SSH private key: %w", err)
		}
		if err := os.Chmod(privateKeyPath, 0o600); err != nil {
			return "", "", fmt.Errorf("secure SSH private key: %w", err)
		}
		publicKeyBytes = ssh.MarshalAuthorizedKey(sshPublicKey)
		if err := os.WriteFile(publicKeyPath, publicKeyBytes, 0o600); err != nil {
			return "", "", fmt.Errorf("save SSH public key: %w", err)
		}
		privateKey = pem.EncodeToMemory(privateKeyPEM)
	} else if privateErr != nil || publicErr != nil {
		return "", "", fmt.Errorf("SSH key files are incomplete in %s; restore both key files or remove the incomplete pair", keyDir)
	}

	parsedPrivateKey, err := ssh.ParsePrivateKey(privateKey)
	if err != nil {
		return "", "", fmt.Errorf("read stored SSH private key: %w", err)
	}
	if err := os.Chmod(privateKeyPath, 0o600); err != nil {
		return "", "", fmt.Errorf("secure SSH private key: %w", err)
	}
	publicKeyText := strings.TrimSpace(string(publicKeyBytes))
	publicKeyFields := strings.Fields(publicKeyText)
	if len(publicKeyFields) < 2 || publicKeyFields[0] != "ssh-ed25519" {
		return "", "", fmt.Errorf("stored SSH public key at %s is invalid", publicKeyPath)
	}
	expectedPublicKeyFields := strings.Fields(string(ssh.MarshalAuthorizedKey(parsedPrivateKey.PublicKey())))
	if publicKeyFields[1] != expectedPublicKeyFields[1] {
		return "", "", fmt.Errorf("stored SSH key files in %s do not match", keyDir)
	}
	return privateKeyPath, publicKeyText, nil
}

func (s *SysAgent) configureSSH(hostname, sshUsername, publicKey string, timeout time.Duration) error {
	s.sshSetupMu.Lock()
	defer s.sshSetupMu.Unlock()

	request := sshSetupRequest{
		RequestID: uuid.NewString(),
		Username:  sshUsername,
		PublicKey: publicKey,
	}
	payload, err := json.Marshal(request)
	if err != nil {
		return fmt.Errorf("encode SSH setup request: %w", err)
	}
	waiter := make(chan sshSetupResult, 1)
	command := "CONFIGURE_SSH:" + string(payload)

	s.mu.Lock()
	s.sshSetupWaiters[request.RequestID] = waiter
	s.commands[hostname] = command
	s.mu.Unlock()

	timer := time.NewTimer(timeout)
	defer timer.Stop()
	select {
	case result := <-waiter:
		if !result.Success {
			return fmt.Errorf("агент не смог настроить SSH: %s", result.Error)
		}
		return nil
	case <-timer.C:
		s.mu.Lock()
		delete(s.sshSetupWaiters, request.RequestID)
		s.mu.Unlock()
		return fmt.Errorf(
			"агент %q не подтвердил настройку SSH за %s; проверьте, что агент запущен с правами администратора/root и обновлён до версии с автоматической настройкой ключа",
			hostname,
			timeout,
		)
	case <-s.stopChan:
		s.mu.Lock()
		delete(s.sshSetupWaiters, request.RequestID)
		s.mu.Unlock()
		return fmt.Errorf("сервер остановлен во время настройки SSH")
	}
}

func (s *SysAgent) deliverSSHSetupResult(result sshSetupResult) {
	s.mu.Lock()
	waiter := s.sshSetupWaiters[result.RequestID]
	delete(s.sshSetupWaiters, result.RequestID)
	s.mu.Unlock()
	if waiter != nil {
		waiter <- result
	}
}

func tcpPortOpen(address string) bool {
	conn, err := net.DialTimeout("tcp", address, 300*time.Millisecond)
	if err != nil {
		return false
	}
	conn.Close()
	return true
}

func waitForTCPPort(address string, timeout time.Duration) error {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()

	for {
		if tcpPortOpen(address) {
			return nil
		}

		select {
		case <-timer.C:
			return fmt.Errorf("тайм-аут ожидания порта %s", address)
		case <-ticker.C:
		}
	}
}

func (s *SysAgent) startSSHProcess(target, privateKeyPath string) (string, error) {
	args := []string{
		"-tt",
		"-o", "BatchMode=yes",
		"-o", "ConnectTimeout=10",
		"-o", "ServerAliveInterval=30",
		"-o", "StrictHostKeyChecking=accept-new",
	}
	if privateKeyPath != "" {
		args = append(args, "-o", "IdentitiesOnly=yes", "-i", privateKeyPath)
	}
	args = append(args, target)
	cmd := exec.Command("ssh", args...)

	session := &sshTerminalSession{cmd: cmd, done: make(chan struct{})}
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return "", fmt.Errorf("create SSH input: %w", err)
	}
	session.stdin = stdin
	cmd.Stdout = session
	cmd.Stderr = session
	if err := cmd.Start(); err != nil {
		stdin.Close()
		return "", fmt.Errorf("start ssh client: %w", err)
	}

	sessionID := uuid.NewString()
	s.sshMu.Lock()
	s.sshSessions[sessionID] = session
	s.sshMu.Unlock()

	go func() {
		err := cmd.Wait()
		session.mu.Lock()
		session.waitErr = err
		session.mu.Unlock()
		close(session.done)
	}()
	return sessionID, nil
}

func (s *SysAgent) WriteSSHSession(sessionID, input string) error {
	s.sshMu.RLock()
	session, ok := s.sshSessions[sessionID]
	s.sshMu.RUnlock()
	if !ok {
		return fmt.Errorf("SSH-сессия %q не найдена", sessionID)
	}

	session.inputMu.Lock()
	defer session.inputMu.Unlock()
	select {
	case <-session.done:
		return fmt.Errorf("SSH-сессия уже завершена")
	default:
	}
	if _, err := io.WriteString(session.stdin, input); err != nil {
		return fmt.Errorf("send input to SSH session: %w", err)
	}
	return nil
}

func (s *SysAgent) ReadSSHSession(sessionID string) (SSHSessionUpdate, error) {
	s.sshMu.RLock()
	session, ok := s.sshSessions[sessionID]
	s.sshMu.RUnlock()
	if !ok {
		return SSHSessionUpdate{}, fmt.Errorf("SSH-сессия %q не найдена", sessionID)
	}
	return session.readUpdate(), nil
}

func (s *SysAgent) CloseSSHSession(sessionID string) {
	s.sshMu.Lock()
	session, ok := s.sshSessions[sessionID]
	if ok {
		delete(s.sshSessions, sessionID)
	}
	s.sshMu.Unlock()
	if !ok {
		return
	}
	session.stdin.Close()
	if session.cmd.Process != nil {
		session.cmd.Process.Kill()
	}
}

// ExecuteRemoteCommand выполняет команду по обратному TCP-соединению от агента.
func (s *SysAgent) ExecuteRemoteCommand(hostname, command string) (string, error) {
	s.mu.RLock()
	_, ok := s.devices[hostname]
	s.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("device %s not found", hostname)
	}
	if strings.TrimSpace(command) == "" {
		return "", fmt.Errorf("command must not be empty")
	}

	session, ok := s.getShellSession(hostname)
	if !ok {
		s.SendCommand(hostname, "START_SHELL")
		session, ok = s.waitForShellSession(hostname, 15*time.Second)
		if !ok {
			return "", fmt.Errorf(
				"agent %s did not open a remote shell connection; check the agent log and allow inbound TCP port %d on the server",
				hostname,
				ShellPort,
			)
		}
	}

	output, err := session.execute(command)
	if err != nil {
		session.conn.Close()
		return "", err
	}
	return output, nil
}

func (s *SysAgent) getShellSession(hostname string) (*remoteShellSession, bool) {
	s.shellMu.RLock()
	defer s.shellMu.RUnlock()
	session, ok := s.shellSessions[hostname]
	return session, ok
}

func (s *SysAgent) waitForShellSession(hostname string, timeout time.Duration) (*remoteShellSession, bool) {
	timer := time.NewTimer(timeout)
	defer timer.Stop()
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	for {
		if session, ok := s.getShellSession(hostname); ok {
			return session, true
		}
		select {
		case <-s.stopChan:
			return nil, false
		case <-timer.C:
			return nil, false
		case <-ticker.C:
		}
	}
}

func (s *SysAgent) runShellServer() {
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", ShellPort))
	if err != nil {
		log.Printf("Remote shell listen error: %v", err)
		return
	}
	s.shellMu.Lock()
	select {
	case <-s.stopChan:
		s.shellMu.Unlock()
		ln.Close()
		return
	default:
	}
	s.shellLn = ln
	s.shellMu.Unlock()

	for {
		conn, err := ln.Accept()
		if err != nil {
			select {
			case <-s.stopChan:
				return
			default:
				log.Printf("Remote shell accept error: %v", err)
				continue
			}
		}
		go s.handleShellConn(conn)
	}
}

func (s *SysAgent) handleShellConn(conn net.Conn) {
	if err := conn.SetReadDeadline(time.Now().Add(5 * time.Second)); err != nil {
		conn.Close()
		return
	}
	decoder := json.NewDecoder(bufio.NewReader(conn))
	var handshake shellHandshake
	if err := decoder.Decode(&handshake); err != nil || handshake.Hostname == "" {
		log.Printf("Invalid remote shell handshake from %s: %v", conn.RemoteAddr(), err)
		conn.Close()
		return
	}
	if err := conn.SetReadDeadline(time.Time{}); err != nil {
		conn.Close()
		return
	}

	s.mu.RLock()
	_, knownDevice := s.devices[handshake.Hostname]
	s.mu.RUnlock()
	if !knownDevice {
		log.Printf("Remote shell connection from unknown device %q", handshake.Hostname)
		conn.Close()
		return
	}

	session := &remoteShellSession{
		conn:      conn,
		encoder:   json.NewEncoder(conn),
		responses: make(chan shellResponse, 1),
		done:      make(chan struct{}),
	}
	s.shellMu.Lock()
	previous := s.shellSessions[handshake.Hostname]
	select {
	case <-s.stopChan:
		s.shellMu.Unlock()
		conn.Close()
		return
	default:
	}
	s.shellSessions[handshake.Hostname] = session
	s.shellMu.Unlock()
	if previous != nil {
		previous.conn.Close()
	}

	log.Printf("Remote shell connected: %s", handshake.Hostname)
	defer func() {
		s.shellMu.Lock()
		if s.shellSessions[handshake.Hostname] == session {
			delete(s.shellSessions, handshake.Hostname)
		}
		s.shellMu.Unlock()
		close(session.done)
		conn.Close()
		log.Printf("Remote shell disconnected: %s", handshake.Hostname)
	}()

	for {
		var response shellResponse
		if err := decoder.Decode(&response); err != nil {
			return
		}
		select {
		case session.responses <- response:
		case <-session.done:
			return
		}
	}
}
func (s *SysAgent) handleTCPConn(conn net.Conn) {
	defer conn.Close()

	var metrics Metrics
	decoder := json.NewDecoder(conn)
	if err := decoder.Decode(&metrics); err != nil {
		log.Printf("JSON decode error from %s: %v", conn.RemoteAddr(), err)
		return
	}
	setupResult := metrics.SSHSetupResult
	hostname := metrics.Hostname
	if hostname == "" {
		return
	}
	ip := conn.RemoteAddr().(*net.TCPAddr).IP.String()

	s.mu.Lock()
	// сохраняем последние данные
	s.devices[hostname] = DeviceInfo{IP: ip, Metrics: metrics}

	// обновляем историю
	if _, ok := s.history[hostname]; !ok {
		s.history[hostname] = &History{
			CPU:  []float64{},
			RAM:  []float64{},
			GPU:  []float64{},
			Time: []int64{},
		}
	}
	hist := s.history[hostname]
	hist.CPU = append(hist.CPU, metrics.CPUPercent)
	hist.RAM = append(hist.RAM, metrics.RAMPercent)
	hist.GPU = append(hist.GPU, metrics.GPUPercent)
	if len(hist.Time) == 0 {
		hist.Time = append(hist.Time, 1)
	} else {
		hist.Time = append(hist.Time, hist.Time[len(hist.Time)-1]+1)
	}
	// обрезаем до MaxHistoryPoints
	if len(hist.CPU) > MaxHistoryPoints {
		hist.CPU = hist.CPU[len(hist.CPU)-MaxHistoryPoints:]
		hist.RAM = hist.RAM[len(hist.RAM)-MaxHistoryPoints:]
		hist.GPU = hist.GPU[len(hist.GPU)-MaxHistoryPoints:]
		hist.Time = hist.Time[len(hist.Time)-MaxHistoryPoints:]
	}

	// проверяем, есть ли команда для этого хоста
	cmd, exists := s.commands[hostname]
	if !exists {
		cmd = "HIDE"
	}
	s.mu.Unlock()

	if setupResult != nil {
		s.deliverSSHSetupResult(*setupResult)
	}

	// отправляем команду агенту
	conn.Write([]byte(cmd))

	// если команда не HIDE, удаляем её (одноразовая)
	if cmd != "HIDE" {
		s.mu.Lock()
		if s.commands[hostname] == cmd {
			delete(s.commands, hostname)
		}
		s.mu.Unlock()
	}
}

// ========== UDP СЕРВЕР (обнаружение) ==========

func (s *SysAgent) runUDPServer() {
	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf(":%d", UDPPort))
	if err != nil {
		log.Printf("UDP resolve error: %v", err)
		return
	}
	conn, err := net.ListenUDP("udp", addr)
	if err != nil {
		log.Printf("UDP listen error: %v", err)
		return
	}
	s.udpConn = conn
	buf := make([]byte, 1024)
	for {
		select {
		case <-s.stopChan:
			return
		default:
			n, remoteAddr, err := conn.ReadFromUDP(buf)
			if err != nil {
				continue
			}
			if string(buf[:n]) == "DISCOVER_SYSADMIN_SERVER" {
				conn.WriteToUDP([]byte("HERE_IS_SYSADMIN_SERVER"), remoteAddr)
			}
		}
	}
}

// ========== МЕТОДЫ ДЛЯ БИНДИНГОВ (Wails) ==========

// GetDevices возвращает карту всех устройств с последними метриками
func (s *SysAgent) GetDevices() map[string]DeviceInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	result := make(map[string]DeviceInfo, len(s.devices))
	for k, v := range s.devices {
		result[k] = v
	}
	return result
}

// GetHistory возвращает историю для указанного устройства
func (s *SysAgent) GetHistory(hostname string) History {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if hist, ok := s.history[hostname]; ok {
		// возвращаем копию
		return History{
			CPU:  append([]float64{}, hist.CPU...),
			RAM:  append([]float64{}, hist.RAM...),
			GPU:  append([]float64{}, hist.GPU...),
			Time: append([]int64{}, hist.Time...),
		}
	}
	return History{}
}

// SendCommand устанавливает команду для агента (будет отправлена при следующем контакте)
func (s *SysAgent) SendCommand(hostname, command string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.commands[hostname] = command
}

// Заглушка
// GetDeviceInfoStub — заглушка для генерации TypeScript-типов
func (s *SysAgent) GetDeviceInfoStub() DeviceInfo {
	return DeviceInfo{}

}
