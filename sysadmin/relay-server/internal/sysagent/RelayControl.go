package sysagent

import (
	"crypto/subtle"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"time"
)

const RelayControlPort = 65436

func listenAgentTCP(address string) (net.Listener, error) {
	certFile := os.Getenv("SYSADMIN_RELAY_TLS_CERT")
	keyFile := os.Getenv("SYSADMIN_RELAY_TLS_KEY")
	if certFile == "" && keyFile == "" {
		return net.Listen("tcp", address)
	}
	if certFile == "" || keyFile == "" {
		return nil, fmt.Errorf("both SYSADMIN_RELAY_TLS_CERT and SYSADMIN_RELAY_TLS_KEY must be set")
	}
	certificate, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("load relay TLS certificate: %w", err)
	}
	return tls.Listen("tcp", address, &tls.Config{Certificates: []tls.Certificate{certificate}, MinVersion: tls.VersionTLS12})
}

type relayRPCRequest struct {
	Method string            `json:"method"`
	Args   []json.RawMessage `json:"args"`
}

type relayRPCResponse struct {
	Result any    `json:"result,omitempty"`
	Error  string `json:"error,omitempty"`
}

func relayArg[T any](request relayRPCRequest, index int) (T, error) {
	var value T
	if index >= len(request.Args) {
		return value, fmt.Errorf("missing argument %d", index)
	}
	if err := json.Unmarshal(request.Args[index], &value); err != nil {
		return value, fmt.Errorf("decode argument %d: %w", index, err)
	}
	return value, nil
}

func (s *SysAgent) runRelayControlServer() {
	token := os.Getenv("SYSADMIN_RELAY_TOKEN")
	certFile := os.Getenv("SYSADMIN_RELAY_TLS_CERT")
	keyFile := os.Getenv("SYSADMIN_RELAY_TLS_KEY")
	if token == "" || certFile == "" || keyFile == "" {
		log.Printf("Relay control API disabled: set SYSADMIN_RELAY_TOKEN, SYSADMIN_RELAY_TLS_CERT and SYSADMIN_RELAY_TLS_KEY")
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /rpc", func(w http.ResponseWriter, r *http.Request) {
		provided := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		if len(provided) != len(token) || subtle.ConstantTimeCompare([]byte(provided), []byte(token)) != 1 {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 32<<20)
		var request relayRPCRequest
		if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		log.Printf("Relay control request method=%s remote=%s", request.Method, r.RemoteAddr)
		result, err := s.dispatchRelayRPC(request)
		w.Header().Set("Content-Type", "application/json")
		if err != nil {
			_ = json.NewEncoder(w).Encode(relayRPCResponse{Error: err.Error()})
			return
		}
		if err := json.NewEncoder(w).Encode(relayRPCResponse{Result: result}); err != nil {
			log.Printf("Relay control response error: %v", err)
		}
	})
	server := &http.Server{Handler: mux, ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 30 * time.Second}
	certificate, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		log.Printf("Relay control TLS certificate error: %v", err)
		return
	}
	server.TLSConfig = &tls.Config{Certificates: []tls.Certificate{certificate}, MinVersion: tls.VersionTLS12}
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", RelayControlPort))
	if err != nil {
		log.Printf("Relay control listen error: %v", err)
		return
	}
	s.controlMu.Lock()
	select {
	case <-s.stopChan:
		s.controlMu.Unlock()
		_ = ln.Close()
		return
	default:
		s.controlServer = server
	}
	s.controlMu.Unlock()
	log.Printf("Relay control API listening with TLS on %s", ln.Addr())
	if err := server.ServeTLS(ln, "", ""); err != nil && err != http.ErrServerClosed {
		log.Printf("Relay control server error: %v", err)
	}
}

func (s *SysAgent) dispatchRelayRPC(request relayRPCRequest) (any, error) {
	stringArg := func(i int) (string, error) { return relayArg[string](request, i) }
	switch request.Method {
	case "GetDevices":
		return s.GetDevices(), nil
	case "SendCommand":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		command, err := stringArg(1)
		if err != nil {
			return nil, err
		}
		s.SendCommand(host, command)
		return nil, nil
	case "ExecuteRemoteCommand":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		command, err := stringArg(1)
		if err != nil {
			return nil, err
		}
		return s.ExecuteRemoteCommand(host, command)
	case "StartSSHSessionByHostname":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		return s.StartSSHSessionByHostname(host)
	case "WriteSSHSession":
		id, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		input, err := stringArg(1)
		if err != nil {
			return nil, err
		}
		return nil, s.WriteSSHSession(id, input)
	case "ReadSSHSession":
		id, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		return s.ReadSSHSession(id)
	case "CloseSSHSession":
		id, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		s.CloseSSHSession(id)
		return nil, nil
	case "StartRDPSessionByHostname":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		return nil, s.StartRDPSessionByHostname(host)
	case "ReadRDPFrame":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		return s.ReadRDPFrame(host)
	case "SendRDPInput":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		button, err := stringArg(1)
		if err != nil {
			return nil, err
		}
		x, err := relayArg[float64](request, 2)
		if err != nil {
			return nil, err
		}
		y, err := relayArg[float64](request, 3)
		if err != nil {
			return nil, err
		}
		return nil, s.SendRDPInput(host, button, x, y)
	case "SendRDPKeyboardInput":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		action, err := stringArg(1)
		if err != nil {
			return nil, err
		}
		key, err := stringArg(2)
		if err != nil {
			return nil, err
		}
		return nil, s.SendRDPKeyboardInput(host, action, key)
	case "CloseRDPSession":
		host, err := stringArg(0)
		if err != nil {
			return nil, err
		}
		s.CloseRDPSession(host)
		return nil, nil
	default:
		return nil, fmt.Errorf("unsupported relay method %q", request.Method)
	}
}
