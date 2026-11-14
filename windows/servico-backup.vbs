' Inicia o servico de backup do Vetra (versao de testes) escondido (usado ao ligar o Windows).
Set sh = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & pasta & "\servico-backup.ps1""", 0, False
