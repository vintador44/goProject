package sysagent

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// RemoteClient is the Wails bridge used by the Remote SysAgent page.
type RemoteClient struct {
	mu       sync.RWMutex
	endpoint string
	token    string
	client   *http.Client
}

func NewRemoteClient() *RemoteClient {
	return &RemoteClient{
		client: &http.Client{
			Timeout: 4 * time.Minute,
			Transport: &http.Transport{
				TLSClientConfig:   &tls.Config{MinVersion: tls.VersionTLS12},
				MaxIdleConns:      8,
				IdleConnTimeout:   30 * time.Second,
				ForceAttemptHTTP2: true,
			},
		},
	}
}

func relayEndpoint(address string) (string, error) {
	address = strings.TrimSpace(address)
	if address == "" {
		return "", fmt.Errorf("введите IP-адрес или домен relay-сервера")
	}
	if strings.Contains(address, "://") {
		parsed, err := url.Parse(address)
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
			return "", fmt.Errorf("relay должен использовать HTTPS")
		}
		if parsed.Path != "" && parsed.Path != "/" {
			return "", fmt.Errorf("укажите только адрес relay-сервера, без пути")
		}
		host := parsed.Hostname()
		if host == "" {
			return "", fmt.Errorf("укажите IP-адрес или домен relay-сервера")
		}
		port := parsed.Port()
		if port == "" {
			port = strconv.Itoa(RelayControlPort)
		} else if number, parseErr := strconv.Atoi(port); parseErr != nil || number < 1 || number > 65535 {
			return "", fmt.Errorf("неверный порт relay-сервера")
		}
		return "https://" + net.JoinHostPort(host, port) + "/rpc", nil
	}
	if strings.Contains(address, "/") {
		return "", fmt.Errorf("укажите только IP-адрес или домен")
	}
	if host, port, err := net.SplitHostPort(address); err != nil {
		address = net.JoinHostPort(strings.Trim(address, "[]"), fmt.Sprint(RelayControlPort))
	} else if host == "" {
		return "", fmt.Errorf("укажите IP-адрес или домен relay-сервера")
	} else if number, parseErr := strconv.Atoi(port); parseErr != nil || number < 1 || number > 65535 {
		return "", fmt.Errorf("неверный порт relay-сервера")
	}
	return "https://" + address + "/rpc", nil
}

func (r *RemoteClient) ConnectRemoteServer(address, token string) error {
	endpoint, err := relayEndpoint(address)
	if err != nil {
		return err
	}
	if strings.TrimSpace(token) == "" {
		return fmt.Errorf("введите токен доступа relay-сервера")
	}
	if err := r.callAt(endpoint, token, "GetDevices", nil, nil); err != nil {
		return fmt.Errorf("не удалось подключиться к relay: %w", err)
	}
	r.mu.Lock()
	r.endpoint = endpoint
	r.token = token
	r.mu.Unlock()
	return nil
}

func (r *RemoteClient) DisconnectRemoteServer() {
	r.mu.Lock()
	r.endpoint = ""
	r.token = ""
	r.mu.Unlock()
}

func (r *RemoteClient) call(method string, args []any, result any) error {
	r.mu.RLock()
	endpoint, token := r.endpoint, r.token
	r.mu.RUnlock()
	if endpoint == "" || token == "" {
		return fmt.Errorf("сначала подключитесь к relay-серверу")
	}
	return r.callAt(endpoint, token, method, args, result)
}

func (r *RemoteClient) callAt(endpoint, token, method string, args []any, result any) error {
	body, err := json.Marshal(struct {
		Method string `json:"method"`
		Args   []any  `json:"args"`
	}{Method: method, Args: args})
	if err != nil {
		return fmt.Errorf("encode relay request: %w", err)
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := r.client.Do(req)
	if err != nil {
		return fmt.Errorf("relay network request failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		message, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return fmt.Errorf("relay returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(message)))
	}
	var response struct {
		Result json.RawMessage `json:"result"`
		Error  string          `json:"error"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 32<<20)).Decode(&response); err != nil {
		return fmt.Errorf("decode relay response: %w", err)
	}
	if response.Error != "" {
		return fmt.Errorf("relay: %s", response.Error)
	}
	if result != nil && len(response.Result) > 0 {
		if err := json.Unmarshal(response.Result, result); err != nil {
			return fmt.Errorf("decode relay result: %w", err)
		}
	}
	return nil
}

func (r *RemoteClient) GetDevices() (map[string]DeviceInfo, error) {
	devices := make(map[string]DeviceInfo)
	err := r.call("GetDevices", nil, &devices)
	return devices, err
}

func (r *RemoteClient) SendCommand(hostname, command string) error {
	return r.call("SendCommand", []any{hostname, command}, nil)
}

func (r *RemoteClient) ExecuteRemoteCommand(hostname, command string) (string, error) {
	var output string
	err := r.call("ExecuteRemoteCommand", []any{hostname, command}, &output)
	return output, err
}

func (r *RemoteClient) StartSSHSessionByHostname(hostname string) (string, error) {
	var sessionID string
	err := r.call("StartSSHSessionByHostname", []any{hostname}, &sessionID)
	return sessionID, err
}

func (r *RemoteClient) WriteSSHSession(sessionID, input string) error {
	return r.call("WriteSSHSession", []any{sessionID, input}, nil)
}

func (r *RemoteClient) ReadSSHSession(sessionID string) (SSHSessionUpdate, error) {
	var update SSHSessionUpdate
	err := r.call("ReadSSHSession", []any{sessionID}, &update)
	return update, err
}

func (r *RemoteClient) CloseSSHSession(sessionID string) {
	_ = r.call("CloseSSHSession", []any{sessionID}, nil)
}

func (r *RemoteClient) StartRDPSessionByHostname(hostname string) error {
	return r.call("StartRDPSessionByHostname", []any{hostname}, nil)
}

func (r *RemoteClient) ReadRDPFrame(hostname string) (string, error) {
	var frame string
	err := r.call("ReadRDPFrame", []any{hostname}, &frame)
	return frame, err
}

func (r *RemoteClient) SendRDPInput(hostname, button string, x, y float64) error {
	return r.call("SendRDPInput", []any{hostname, button, x, y}, nil)
}

func (r *RemoteClient) SendRDPKeyboardInput(hostname, action, key string) error {
	return r.call("SendRDPKeyboardInput", []any{hostname, action, key}, nil)
}

func (r *RemoteClient) CloseRDPSession(hostname string) {
	_ = r.call("CloseRDPSession", []any{hostname}, nil)
}
