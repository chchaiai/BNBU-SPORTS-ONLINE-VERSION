import {Injectable,Logger,type OnApplicationBootstrap,type OnModuleDestroy} from '@nestjs/common';
import {ExerciseSessionsService} from './exercise-sessions.service.js';

@Injectable()
export class ExerciseLimitWorker implements OnApplicationBootstrap,OnModuleDestroy {
  private timer:ReturnType<typeof setInterval>|null=null;
  private running=false;
  private readonly logger=new Logger(ExerciseLimitWorker.name);
  constructor(private readonly sessions:ExerciseSessionsService){}
  onApplicationBootstrap(){this.timer=setInterval(()=>void this.tick(),1000);this.timer.unref();}
  onModuleDestroy(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  async tick(){
    if(this.running)return;
    this.running=true;
    try{await this.sessions.completeDueSessions();}
    catch{this.logger.error('Exercise duration limit scan failed; due sessions will be retried.');}
    finally{this.running=false;}
  }
}
