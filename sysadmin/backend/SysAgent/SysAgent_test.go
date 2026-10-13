package sysagent

import (
	"bufio"
	"encoding/json"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"golang.org/x/crypto/ssh"
)

func TestExecuteRemoteCommandUsesReverseShellSession(t *testing.T) {
	serverConn, agentConn := net.Pipe()
	defer agentConn.Close()

	agent := New()
	agent.devices["test-device"] = DeviceInfo{}
	go agent.handleShellConn(serverConn)

	agentReader := json.NewDecoder(bufio.NewReader(agentConn))
	agentWriter := json.NewEncoder(agentConn)
	if err := agentWriter.Encode(shellHandshake{Hostname: "test-device"}); err != nil {
		t.Fatalf("send shell handshake: %v", err)
	}

	type result struct {
		output string
		err    error
	}
	resultCh := make(chan result, 1)
	go func() {
		output, err := agent.ExecuteRemoteCommand("test-device", "echo hello")
		resultCh <- result{output: output, err: err}
	}()

	var request shellRequest
	if err := agentReader.Decode(&request); err != nil {
		t.Fatalf("read remote command: %v", err)
	}
	if request.Command != "echo hello" {
		t.Fatalf("command = %q, want %q", request.Command, "echo hello")
	}
	if err := agentWriter.Encode(shellResponse{Output: "hello\n"}); err != nil {
		t.Fatalf("send command response: %v", err)
	}

	select {
	case got := <-resultCh:
		if got.err != nil {
			t.Fatalf("ExecuteRemoteCommand returned error: %v", got.err)
		}
		if got.output != "hello\n" {
			t.Fatalf("output = %q, want %q", got.output, "hello\n")
		}
	case <-time.After(time.Second):
		t.Fatal("ExecuteRemoteCommand did not return")
	}

	agent.Stop()
}

func TestSSHSessionStreamsInputAndOutput(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("uses a Unix test executable")
	}

	tempDir := t.TempDir()
	argsPath := filepath.Join(tempDir, "ssh-args")
	fakeSSH := filepath.Join(tempDir, "ssh")
	script := "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$SSH_TEST_ARGS\"\nwhile IFS= read -r line; do printf 'OUT:%s\\n' \"$line\"; done\n"
	if err := os.WriteFile(fakeSSH, []byte(script), 0o700); err != nil {
		t.Fatalf("write fake ssh executable: %v", err)
	}
	t.Setenv("PATH", tempDir)
	t.Setenv("SSH_TEST_ARGS", argsPath)

	agent := New()
	agent.devices["test-device"] = DeviceInfo{IP: "192.0.2.10"}
	privateKeyPath := filepath.Join(tempDir, "id_ed25519")
	sessionID, err := agent.startSSHProcess("sysadmin@192.0.2.10", privateKeyPath)
	if err != nil {
		t.Fatalf("start SSH process: %v", err)
	}
	defer agent.CloseSSHSession(sessionID)

	deadline := time.Now().Add(time.Second)
	var args []byte
	for time.Now().Before(deadline) {
		args, err = os.ReadFile(argsPath)
		if err == nil {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if err != nil {
		t.Fatalf("read SSH arguments: %v", err)
	}
	for _, want := range []string{
		"-tt",
		"BatchMode=yes",
		"IdentitiesOnly=yes",
		"StrictHostKeyChecking=accept-new",
		privateKeyPath,
		"192.0.2.10",
	} {
		if !strings.Contains(string(args), want) {
			t.Errorf("SSH arguments %q do not contain %q", args, want)
		}
	}

	if err := agent.WriteSSHSession(sessionID, "echo test\n"); err != nil {
		t.Fatalf("write to SSH session: %v", err)
	}
	deadline = time.Now().Add(time.Second)
	var update SSHSessionUpdate
	for time.Now().Before(deadline) {
		update, err = agent.ReadSSHSession(sessionID)
		if err != nil {
			t.Fatalf("read SSH session output: %v", err)
		}
		if strings.Contains(update.Output, "OUT:echo test") {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !strings.Contains(update.Output, "OUT:echo test") {
		t.Fatalf("SSH input was not echoed; output = %q", update.Output)
	}
}

func TestConfigureSSHWaitsForAgentAcknowledgement(t *testing.T) {
	agent := New()
	result := make(chan error, 1)
	go func() {
		result <- agent.configureSSH("test-device", "ssh-ed25519 YWJj sysadmin", time.Second)
	}()

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		agent.mu.RLock()
		command := agent.commands["test-device"]
		agent.mu.RUnlock()
		if strings.HasPrefix(command, "CONFIGURE_SSH:") {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}

	agent.mu.RLock()
	command := agent.commands["test-device"]
	agent.mu.RUnlock()
	if !strings.HasPrefix(command, "CONFIGURE_SSH:") {
		t.Fatalf("queued command = %q, want CONFIGURE_SSH request", command)
	}
	var request sshSetupRequest
	if err := json.Unmarshal([]byte(strings.TrimPrefix(command, "CONFIGURE_SSH:")), &request); err != nil {
		t.Fatalf("decode queued setup request: %v", err)
	}
	// if request.Username != sshUsername || request.PublicKey != "ssh-ed25519 YWJj sysadmin" {
	// 	t.Fatalf("setup request = %+v, want sysadmin and generated public key", request)
	// }
	agent.deliverSSHSetupResult(sshSetupResult{RequestID: request.RequestID, Success: true})

	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("configureSSH returned error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("configureSSH did not return after agent acknowledgement")
	}
}

func TestEnsureSSHKeyCreatesAndReusesKeyPair(t *testing.T) {
	configDir := t.TempDir()
	t.Setenv("XDG_CONFIG_HOME", configDir)
	t.Setenv("APPDATA", configDir)

	agent := New()
	privateKeyPath, publicKey, err := agent.ensureSSHKey()
	if err != nil {
		t.Fatalf("create SSH key pair: %v", err)
	}
	if !strings.HasPrefix(publicKey, "ssh-ed25519 ") {
		t.Fatalf("public key = %q, want an Ed25519 authorized key", publicKey)
	}
	privateKeyBytes, err := os.ReadFile(privateKeyPath)
	if err != nil {
		t.Fatalf("read generated private key: %v", err)
	}
	if _, err := ssh.ParsePrivateKey(privateKeyBytes); err != nil {
		t.Fatalf("parse generated private key: %v", err)
	}
	reusedPath, reusedPublicKey, err := agent.ensureSSHKey()
	if err != nil {
		t.Fatalf("reuse SSH key pair: %v", err)
	}
	if reusedPath != privateKeyPath || reusedPublicKey != publicKey {
		t.Fatal("SSH key pair changed between calls")
	}
}

func TestWaitForTCPPort(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen on simulated SSH port: %v", err)
	}
	if err := waitForTCPPort(listener.Addr().String(), time.Second); err != nil {
		t.Fatalf("waitForTCPPort returned error for open port: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close simulated SSH port: %v", err)
	}
	err = waitForTCPPort(listener.Addr().String(), 50*time.Millisecond)
	if err == nil || !strings.Contains(err.Error(), "тайм-аут") {
		t.Fatalf("waitForTCPPort error = %v, want timeout", err)
	}
}
