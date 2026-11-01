import {test} from 'node:test';
import assert from 'node:assert/strict';
import snmp from 'net-snmp';
import {probe} from '../monitoring.mjs';

test('SNMPv3 SHA/AES consulta sysUpTime em agente real no loopback e rejeita chave errada',async()=>{
  const agent=snmp.createAgent({port:21161,address:'127.0.0.1',disableAuthorization:false},()=>{});
  const user={name:'cloudworld-test',level:snmp.SecurityLevel.authPriv,authProtocol:snmp.AuthProtocols.sha,authKey:'test-auth-key-123',privProtocol:snmp.PrivProtocols.aes,privKey:'test-priv-key-123'};
  agent.getAuthorizer().addUser(user);
  const mib=agent.getMib();mib.registerProvider({name:'sysUpTime',type:snmp.MibProviderType.Scalar,oid:'1.3.6.1.2.1.1.3',scalarType:snmp.ObjectType.TimeTicks,maxAccess:snmp.MaxAccess['read-only']});mib.setScalarValue('sysUpTime',12345);
  const target={type:'snmp',host:'127.0.0.1',port:21161,user:user.name,authKey:user.authKey,privKey:user.privKey};
  try{
    const result=await probe(target);assert.equal(result.state,'up',result.detail);assert.equal(result.detail,'sysUpTime=12345');
    assert.equal((await probe({...target,authKey:'incorrect-auth-key'})).state,'down');
  }finally{agent.close();}
});
