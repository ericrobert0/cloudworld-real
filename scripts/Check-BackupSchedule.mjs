import {BackupScheduleMonitor} from '../backup-schedule.mjs';
if(process.argv.length>2)throw Error('Uso: node scripts/Check-BackupSchedule.mjs');
const status=await new BackupScheduleMonitor().refresh({force:true});
console.log(JSON.stringify({verified:status.verified,at:status.at,nextAt:status.nextAt,scheduler:status.scheduler||null,detail:status.detail},null,2));
if(!status.verified)process.exitCode=2;
