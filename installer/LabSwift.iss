[Setup]
AppName=LabSwift
AppVersion=1.0.0
AppPublisher=LabSwift
AppPublisherURL=https://labswift.rf.gd
AppSupportURL=https://labswift.rf.gd
AppUpdatesURL=https://labswift.rf.gd
DefaultDirName={autopf}\LabSwift
DefaultGroupName=LabSwift
AllowNoIcons=no
LicenseFile=..\LICENSE.txt
OutputDir=..\release
OutputBaseFilename=LabSwift-Setup-1.1.0
SetupIconFile=..\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64os
ArchitecturesInstallIn64BitMode=x64os
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\LabSwift.exe
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "startup"; Description: "Start LabSwift automatically when Windows starts"; GroupDescription: "Startup options:"; Flags: unchecked

[Files]
Source: "..\release\win-unpacked\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\LabSwift"; Filename: "{app}\LabSwift.exe"
Name: "{autodesktop}\LabSwift"; Filename: "{app}\LabSwift.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "LabSwift"; ValueData: """{app}\LabSwift.exe"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
; Register Windows Firewall rules for both roles so the OS never prompts
; (the prompt would fail silently on student accounts without admin rights)
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""LabSwift"""; Flags: runhidden waituntilterminated; StatusMsg: "Configuring firewall..."
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""LabSwift (Admin)"" dir=in action=allow protocol=TCP localport=7890 program=""{app}\LabSwift.exe"" enable=yes profile=private,domain"; Flags: runhidden waituntilterminated
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""LabSwift (Client)"" dir=in action=allow protocol=TCP localport=7891 program=""{app}\LabSwift.exe"" enable=yes profile=private,domain"; Flags: runhidden waituntilterminated
Filename: "{app}\LabSwift.exe"; Description: "{cm:LaunchProgram,LabSwift}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
; Clean up firewall rules on uninstall
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""LabSwift (Admin)"""; Flags: runhidden waituntilterminated
Filename: "netsh"; Parameters: "advfirewall firewall delete rule name=""LabSwift (Client)"""; Flags: runhidden waituntilterminated

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\LabSwift"
