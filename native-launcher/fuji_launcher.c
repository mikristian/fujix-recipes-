/*
 * Fuji X Recipes native bundle bootstrap.
 * Opens the existing signed Tauri workspace shell, automatically starting the
 * local FujiX Sync service on this Mac if it is not already available.
 * No camera commands are sent: this only checks a loopback HTTP endpoint.
 *
 * Build: clang -arch arm64 -O2 -Wall -Wextra fuji_launcher.c -o fuji-launch
 */
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <netinet/in.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/file.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <unistd.h>

#define FUJI_PORT 4194
#define READY_TOKEN "FujiX Sync Offline Studio"

/* Distinguishes our app from an unrelated service that might reuse port 4194. */
static int service_state(void) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return 0;
    struct timeval timeout = { .tv_sec = 0, .tv_usec = 500000 };
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, sizeof(timeout));
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &timeout, sizeof(timeout));
    struct sockaddr_in address = {0};
    address.sin_family = AF_INET;
    address.sin_port = htons(FUJI_PORT);
    address.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    if (connect(fd, (struct sockaddr *)&address, sizeof(address)) != 0) {
        close(fd);
        return 0; /* Not listening */
    }
    const char *request = "GET /api/studio/readiness HTTP/1.0\r\nHost: 127.0.0.1:4194\r\nConnection: close\r\n\r\n";
    (void)write(fd, request, strlen(request));
    char body[8192];
    ssize_t used = 0, count;
    while (used < (ssize_t)sizeof(body) - 1 &&
           (count = read(fd, body + used, sizeof(body) - 1 - (size_t)used)) > 0) {
        used += count;
    }
    close(fd);
    body[used] = '\0';
    return strstr(body, READY_TOKEN) ? 1 : -1; /* -1: port occupied by other service */
}

static void spawn_server(const char *root, const char *server_path, const char *log_path) {
    const char *node = NULL;
    if (access("/usr/local/bin/node", X_OK) == 0) node = "/usr/local/bin/node";
    else if (access("/opt/homebrew/bin/node", X_OK) == 0) node = "/opt/homebrew/bin/node";
    if (!node || access(server_path, R_OK) != 0) {
        fprintf(stderr, "Fuji X Recipes: local FujiX Sync server or Node.js not found\n");
        return;
    }
    pid_t pid = fork();
    if (pid != 0) return; /* Parent resumes, then runs the native app. */
    (void)setsid();
    (void)signal(SIGHUP, SIG_IGN);
    if (chdir(root) != 0) _exit(127);
    int out = open(log_path, O_CREAT | O_APPEND | O_WRONLY, 0600);
    if (out >= 0) {
        (void)dup2(out, STDOUT_FILENO);
        (void)dup2(out, STDERR_FILENO);
        if (out > STDERR_FILENO) close(out);
    }
    int in = open("/dev/null", O_RDONLY);
    if (in >= 0) { (void)dup2(in, STDIN_FILENO); if (in > STDERR_FILENO) close(in); }
    execl(node, node, server_path, (char *)NULL);
    _exit(127);
}

int main(int argc, char **argv) {
    const char *home = getenv("HOME");
    if (!home || !*home) return 1;
    char root[PATH_MAX], data[PATH_MAX], server[PATH_MAX], log_path[PATH_MAX], lock_path[PATH_MAX];
    if (snprintf(root, sizeof(root), "%s", getenv("FUJIX_SYNC_ROOT") ? getenv("FUJIX_SYNC_ROOT") : "."") >= (int)sizeof(root) ||
        snprintf(data, sizeof(data), "%s/data", root) >= (int)sizeof(data) ||
        snprintf(server, sizeof(server), "%s/server.mjs", root) >= (int)sizeof(server) ||
        snprintf(log_path, sizeof(log_path), "%s/server.log", data) >= (int)sizeof(log_path) ||
        snprintf(lock_path, sizeof(lock_path), "%s/.fuji-app-start.lock", data) >= (int)sizeof(lock_path)) return 1;
    if (access(server, R_OK) == 0) {
        (void)mkdir(data, 0700);
        int lock = open(lock_path, O_CREAT | O_RDWR, 0600);
        if (lock >= 0) (void)flock(lock, LOCK_EX);
        if (service_state() == 0) {
            spawn_server(root, server, log_path);
        }
        int status = 0;
        for (int i = 0; i < 40; i++) {
            status = service_state();
            if (status != 0) break;
            usleep(250000);
        }
        if (lock >= 0) { (void)flock(lock, LOCK_UN); close(lock); }
        if (status == -1) {
            fprintf(stderr, "Fuji X Recipes: another service already occupies port %d; refusing to load the wrong website\n", FUJI_PORT);
            return 2;
        }
    }
    /* Tauri shell remains the actual window and app process (same PID). */
    char shell[PATH_MAX];
    const char *slash = strrchr(argv[0], '/');
    if (!slash || (size_t)(slash - argv[0]) + sizeof("/workspace-shell") >= sizeof(shell)) return 1;
    snprintf(shell, sizeof(shell), "%.*s/workspace-shell", (int)(slash - argv[0]), argv[0]);
    argv[0] = shell;
    execv(shell, argv);
    fprintf(stderr, "Fuji X Recipes: cannot launch native workspace: %s\n", strerror(errno));
    (void)argc;
    return 127;
}
