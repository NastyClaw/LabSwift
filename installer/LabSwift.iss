[Setup]
AppName=LabSwift
AppVersion=1.0.0
AppPublisher=LabSwift
AppPublisherURL=https://github.com/labswift
AppSupportURL=https://github.com/labswift
AppUpdatesURL=https://github.com/labswift
DefaultDirName={autopf}\LabSwift
DefaultGroupName=LabSwift
AllowNoIcons=no
LicenseFile=..\LICENSE.txt
OutputDir=..\release
OutputBaseFilename=LabSwift-Setup-1.0.0
SetupIconFile=..\assets\icon.ico
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
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
Filename: "{app}\LabSwift.exe"; Description: "{cm:LaunchProgram,LabSwift}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\LabSwift"
