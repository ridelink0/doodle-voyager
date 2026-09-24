' Runs a .cmd file with no console window. Usage: wscript run-hidden.vbs <file.cmd>
If WScript.Arguments.Count > 0 Then CreateObject("WScript.Shell").Run """" & WScript.Arguments(0) & """", 0, False
