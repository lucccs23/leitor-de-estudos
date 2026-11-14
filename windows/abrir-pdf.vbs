' Abre um PDF no Vetra (versão de testes) sem mostrar janela de terminal.
If WScript.Arguments.Count = 0 Then WScript.Quit
Set sh = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & pasta & "\abrir-pdf.ps1"" """ & WScript.Arguments(0) & """", 0, False
