// Windows and native Linux require distinct, host-specific storage confirmation.
export function assertHostStorage({platform,info,windowsConfirmed=false,linuxConfirmation=null,codespaceName=null,codespacesConfirmation=null}){
  if(info?.OSType!=='linux')throw Error('O Docker precisa estar executando containers Linux.');
  if(platform==='win32'){
    if(!windowsConfirmed)throw Error('Confirme o disco virtual Docker no D: usando scripts/Confirm-DockerStorage.ps1.');
    return;
  }
  if(platform!=='linux')throw Error('Host nao homologado. Use Windows com Docker Desktop ou servidor Linux.');
  if(/docker desktop/i.test(info.OperatingSystem||''))throw Error('Execute a preparacao no servidor Linux nativo, nao no Docker Desktop.');
  const root=info.DockerRootDir;
  if(typeof root!=='string'||!root.startsWith('/')||root==='/')throw Error('Diretorio de dados Docker invalido.');
  if(codespaceName){
    const m=codespacesConfirmation;
    if(!m||m.runtime!=='codespaces'||m.name!==codespaceName||m.serverId!==info.ID||m.dockerRootDir!==root||info.Driver!=='overlay2')throw Error('Confirme o armazenamento deste Codespace com node scripts/Prepare-Codespaces.mjs.');
    return;
  }
  if(!linuxConfirmation||linuxConfirmation.platform!=='linux'||linuxConfirmation.dockerRootDir!==root||linuxConfirmation.serverId!==info.ID)throw Error('Confirme o armazenamento deste servidor com node scripts/Check-LinuxHost.mjs --confirm-storage.');
}
