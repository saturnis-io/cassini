; ---------------------------------------------------------------------------
; Cassini SPC — Inno Setup 6 Installer Script
;
; Builds a professional Windows installer from PyInstaller output.
;
; Compile:
;   iscc cassini.iss
;
; Prerequisites:
;   - PyInstaller output in ../backend/dist/cassini-server/
;   - PyInstaller output in ../backend/dist/cassini-tray/
;   - (Optional) PyInstaller output in ../../bridge/dist/cassini-bridge/
; ---------------------------------------------------------------------------

#define MyAppName "Cassini SPC"
#define MyAppVersion "0.0.9"
#define MyAppPublisher "Saturnis"
#define MyAppURL "https://saturnis.io/cassini"
#define MyAppExeName "cassini-server.exe"
#define MyTrayExeName "cassini-tray.exe"
#define MyBridgeExeName "cassini-bridge.exe"
#define MyServiceName "CassiniSPC"

[Setup]
AppId={{B7E3F4A1-9C2D-4E8F-A5B6-1D3E7F9A2C4B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\Cassini
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
LicenseFile=..\LICENSE
OutputDir=output
OutputBaseFilename=cassini-spc-{#MyAppVersion}-setup
SetupIconFile=..\backend\assets\cassini.ico
UninstallDisplayIcon={app}\cassini-server.exe
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallMode=x64compatible
PrivilegesRequired=admin
MinVersion=10.0
VersionInfoVersion={#MyAppVersion}.0
VersionInfoCompany={#MyAppPublisher}
VersionInfoProductName={#MyAppName}
VersionInfoProductVersion={#MyAppVersion}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; ---------------------------------------------------------------------------
; Components — user picks which pieces to install
; ---------------------------------------------------------------------------
[Components]
Name: "server"; Description: "Cassini SPC Server"; Types: full compact custom; Flags: fixed
Name: "tray"; Description: "System Tray Companion"; Types: full compact custom; Flags: fixed
Name: "bridge"; Description: "Cassini Bridge (serial gage to MQTT)"; Types: full; ExtraDiskSpaceRequired: 52428800

; ---------------------------------------------------------------------------
; Tasks — optional post-install actions
; ---------------------------------------------------------------------------
[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "addtopath"; Description: "Add Cassini to system PATH"; GroupDescription: "System integration:"; Flags: unchecked
Name: "installservice"; Description: "Install as Windows Service (auto-start)"; GroupDescription: "System integration:"

; ---------------------------------------------------------------------------
; Files — what gets installed
; ---------------------------------------------------------------------------
[Files]
; Server (PyInstaller --onedir output)
Source: "..\backend\dist\cassini-server\*"; DestDir: "{app}"; Components: server; Flags: ignoreversion recursesubdirs createallsubdirs

; Tray companion (PyInstaller --onedir output)
Source: "..\backend\dist\cassini-tray\*"; DestDir: "{app}\tray"; Components: tray; Flags: ignoreversion recursesubdirs createallsubdirs

; Bridge (PyInstaller --onedir output)
Source: "..\bridge\dist\cassini-bridge\*"; DestDir: "{app}\bridge"; Components: bridge; Flags: ignoreversion recursesubdirs createallsubdirs

; Default configuration — never overwrite user-modified config
Source: "templates\cassini.toml"; DestDir: "{commonappdata}\Cassini"; Flags: onlyifdoesntexist uninsneveruninstall

; ---------------------------------------------------------------------------
; Directories — created during install
; ---------------------------------------------------------------------------
[Dirs]
Name: "{commonappdata}\Cassini"; Permissions: users-modify
Name: "{commonappdata}\Cassini\logs"; Permissions: users-modify

; ---------------------------------------------------------------------------
; Icons — Start Menu and Desktop shortcuts
; ---------------------------------------------------------------------------
[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\tray\{#MyTrayExeName}"; Comment: "Launch Cassini SPC system tray companion"
Name: "{group}\Cassini Terminal"; Filename: "{app}\{#MyAppExeName}"; Parameters: "serve"; Comment: "Run Cassini SPC server in terminal mode"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\tray\{#MyTrayExeName}"; Tasks: desktopicon; Comment: "Launch Cassini SPC system tray companion"

; ---------------------------------------------------------------------------
; Run — post-install actions
; ---------------------------------------------------------------------------
[Run]
; Install and start as Windows Service (if selected)
Filename: "{app}\{#MyAppExeName}"; Parameters: "service install"; StatusMsg: "Installing Cassini service..."; Tasks: installservice; Flags: runhidden waituntilterminated
Filename: "net"; Parameters: "start {#MyServiceName}"; StatusMsg: "Starting Cassini service..."; Tasks: installservice; Flags: runhidden waituntilterminated
; Offer to launch tray app after install
Filename: "{app}\tray\{#MyTrayExeName}"; Description: "Launch {#MyAppName} tray companion"; Flags: nowait postinstall skipifsilent unchecked

; ---------------------------------------------------------------------------
; UninstallRun — cleanup on uninstall
; ---------------------------------------------------------------------------
[UninstallRun]
; Stop the service (ignore errors if not running)
Filename: "net"; Parameters: "stop {#MyServiceName}"; RunOnceId: "StopService"; Flags: runhidden
; Remove the service registration
Filename: "{app}\{#MyAppExeName}"; Parameters: "service uninstall"; RunOnceId: "UninstallService"; Flags: runhidden waituntilterminated

; ---------------------------------------------------------------------------
; Registry — PATH registration (only if task selected)
; ---------------------------------------------------------------------------
[Registry]
; We do not write PATH in [Registry] directly because Inno Setup's
; built-in string append would duplicate entries on reinstall.
; Instead, PATH manipulation is handled in [Code] below.

; ---------------------------------------------------------------------------
; Code — Pascal Script for PATH management and cleanup
; ---------------------------------------------------------------------------
[Code]

// -----------------------------------------------------------------------
// NeedsAddPath — returns True if {app} is NOT already in the system PATH
// -----------------------------------------------------------------------
function NeedsAddPath(Param: string): Boolean;
var
  OrigPath: string;
  AppDir: string;
begin
  Result := True;
  AppDir := ExpandConstant('{app}');
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath) then
    Exit;
  // Ensure trailing semicolons for reliable substring matching
  if Copy(OrigPath, Length(OrigPath), 1) <> ';' then
    OrigPath := OrigPath + ';';
  AppDir := AppDir + ';';
  if Pos(Uppercase(AppDir), Uppercase(OrigPath)) > 0 then
    Result := False;
end;

// -----------------------------------------------------------------------
// AddToPath — appends {app} to the system PATH registry entry
// -----------------------------------------------------------------------
procedure AddToPath();
var
  OrigPath: string;
  AppDir: string;
begin
  AppDir := ExpandConstant('{app}');
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath) then
    OrigPath := '';
  // Only add if not already present
  if NeedsAddPath('') then
  begin
    if (Length(OrigPath) > 0) and (Copy(OrigPath, Length(OrigPath), 1) <> ';') then
      OrigPath := OrigPath + ';';
    OrigPath := OrigPath + AppDir;
    RegWriteExpandStringValue(HKEY_LOCAL_MACHINE,
      'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
      'Path', OrigPath);
  end;
end;

// -----------------------------------------------------------------------
// RemoveFromPath — removes {app} from the system PATH on uninstall
// -----------------------------------------------------------------------
procedure RemoveFromPath();
var
  OrigPath: string;
  AppDir: string;
  P: Integer;
begin
  AppDir := ExpandConstant('{app}');
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath) then
    Exit;
  // Try with trailing semicolon first (mid-PATH entry)
  P := Pos(Uppercase(AppDir + ';'), Uppercase(OrigPath));
  if P > 0 then
  begin
    Delete(OrigPath, P, Length(AppDir) + 1);
    RegWriteExpandStringValue(HKEY_LOCAL_MACHINE,
      'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
      'Path', OrigPath);
    Exit;
  end;
  // Try without trailing semicolon (last entry in PATH)
  P := Pos(Uppercase(AppDir), Uppercase(OrigPath));
  if P > 0 then
  begin
    Delete(OrigPath, P, Length(AppDir));
    // Remove trailing semicolon left behind
    if (Length(OrigPath) > 0) and (Copy(OrigPath, Length(OrigPath), 1) = ';') then
      Delete(OrigPath, Length(OrigPath), 1);
    RegWriteExpandStringValue(HKEY_LOCAL_MACHINE,
      'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
      'Path', OrigPath);
  end;
end;

// -----------------------------------------------------------------------
// CurStepChanged — fires after each wizard step completes
// -----------------------------------------------------------------------
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    if IsTaskSelected('addtopath') then
      AddToPath();
  end;
end;

// -----------------------------------------------------------------------
// CurUninstallStepChanged — fires during uninstall steps
// -----------------------------------------------------------------------
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    RemoveFromPath();
    // NOTE: We intentionally do NOT delete {commonappdata}\Cassini\
    // to preserve user data (database, config, logs, license keys).
  end;
end;
