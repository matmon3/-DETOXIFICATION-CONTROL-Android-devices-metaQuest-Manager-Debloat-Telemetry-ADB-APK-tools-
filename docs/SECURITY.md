# Segurança — DETOXIFICATION CONTROL

Princípios obrigatórios para o projeto.

## Execução de comandos

- **Nunca** invoque `adb`/`fastboot` via `sh -c`/`bash -c`/`eval`.
- Sempre `std::process::Command` com argumentos estruturados (`Vec<String>`),
  separando `command`, `args`, `env`, `cwd`.
- Linhas do terminal ADB são parseadas com `shlex` (sem eval). Comandos shell
  de host (`sh`, `bash`, `zsh`, `eval`, `xargs`, `su`, `sudo`, `rm`, `dd`)
  são bloqueados — use `adb shell <cmd>` para comandos do dispositivo.

## Operações destrutivas

Nunca executar automaticamente:

```
rm -rf /          format          erase partitions
fastboot flash    fastboot erase  wipe data
```

Regras:

1. Mostrar o comando exato que será executado.
2. Explicar consequências.
3. Confirmação explícita do usuário (Fase 2 em diante).
4. Segunda confirmação para operações críticas (ex.: desinstalação de app do
   sistema, `pm uninstall --user 0`).

## Limites éticos

O DETOXIFICATION CONTROL **não** implementa:

- bypass de FRP, bloqueio de conta ou DRM;
- desbloqueio de bootloader contra a vontade do fabricante;
- obtenção automática de root.

Operações que exigem root são detectadas e relatadas ("This operation requires
root access."), nunca executadas automaticamente.

## Dados

- O log de operações e o histórico do terminal ficam em memória; o histórico de
  backup/config não armazena senhas.
- `settings.json` guarda apenas caminhos e preferências, sem credenciais.

## Permissões de arquivo (host)

- Backups e downloads usam o diretório do usuário (`~/Downloads`, `~/Backups`),
  nunca diretórios de sistema sem permissão.
