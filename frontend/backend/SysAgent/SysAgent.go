package sysagent

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"sync"
	"time"
)

// ========== КОНСТАНТЫ ==========
const (
	TCPPort          = 65432
	UDPPort          = 65433
	ShellPort        = 65434
	MaxHistoryPoints = 60
)

// ========== СТРУКТУРЫ ДАННЫХ ==========

// Metrics — то, что присылает агент
type Metrics struct {
	Hostname      string                 `json:"hostname"`
	CPUPercent    float64                `json:"cpu_percent"`
	RAMPercent    float64                `json:"ram_percent"`
	GPUPercent    float64                `json:"gpu_percent"`
	CPUModel      string                 `json:"cpu_model"`
	CPUTemp       string                 `json:"cpu_temp"`
	RAMTotal      float64                `json:"ram_total"`
	GPUModel      string                 `json:"gpu_model"`
	GPUTemp       string                 `json:"gpu_temp"`
	Disks         map[string]interface{} `json:"disks"`
	NetInterfaces map[string]interface{} `json:"net_interfaces"`
}

// DeviceInfo — хранит последние данные и IP устройства
type DeviceInfo struct {
	IP      string  `json:"ip"`
	Metrics Metrics `json:"metrics"`
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
}

// New — конструктор
func New() *SysAgent {
	return &SysAgent{
		devices:  make(map[string]DeviceInfo),
		history:  make(map[string]*History),
		commands: make(map[string]string),
		stopChan: make(chan struct{}),
	}
}

// ========== ЗАПУСК / ОСТАНОВ ==========

// Start запускает TCP и UDP серверы
func (s *SysAgent) Start() {
	go s.runTCPServer()
	go s.runUDPServer()
	log.Println("SysAgent: TCP и UDP серверы запущены")
}

// Stop останавливает серверы (graceful shutdown)
func (s *SysAgent) Stop() {
	close(s.stopChan)
	if s.tcpLn != nil {
		s.tcpLn.Close()
	}
	if s.udpConn != nil {
		s.udpConn.Close()
	}
	log.Println("SysAgent: остановлен")
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

// ExecuteRemoteCommand выполняет произвольную команду на удалённом агенте
// Требует, чтобы агенту была отправлена команда "START_SHELL" (отправляется автоматически)
func (s *SysAgent) ExecuteRemoteCommand(hostname, command string) (string, error) {
	s.mu.RLock()
	device, ok := s.devices[hostname]
	s.mu.RUnlock()
	if !ok {
		return "", fmt.Errorf("device %s not found", hostname)
	}
	ip := device.IP

	// Отправляем START_SHELL, если ещё не отправляли (можно хранить флаг в памяти, но для простоты будем отправлять каждый раз)
	// Это безопасно, т.к. агент просто запускает шелл-сервер, если он ещё не запущен.
	s.SendCommand(hostname, "START_SHELL")

	// Даём агенту время запустить сервер (≈500ms)

	time.Sleep(3 * time.Second)

	// Подключаемся к ShellPort на агенте
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(ip, strconv.Itoa(ShellPort)), 3*time.Second)
	if err != nil {
		return "", fmt.Errorf("не удалось подключиться к агенту: %v", err)
	}
	defer conn.Close()

	// Отправляем команду (добавляем \n)
	_, err = conn.Write([]byte(command + "\n"))
	if err != nil {
		return "", err
	}

	// Читаем ответ до закрытия соединения или таймаута
	conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	data, err := io.ReadAll(conn)
	if err != nil {
		return "", err
	}

	return string(data), nil
}
func (s *SysAgent) handleTCPConn(conn net.Conn) {
	defer conn.Close()

	var metrics Metrics
	decoder := json.NewDecoder(conn)
	if err := decoder.Decode(&metrics); err != nil {
		log.Printf("JSON decode error from %s: %v", conn.RemoteAddr(), err)
		return
	}
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

	// отправляем команду агенту
	conn.Write([]byte(cmd))

	// если команда не HIDE, удаляем её (одноразовая)
	if cmd != "HIDE" {
		s.mu.Lock()
		delete(s.commands, hostname)
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
