import { GroupOnlyRule } from "entities/rules";
import { resolvePath } from 'utils';
import { ZapCommand } from "./command";
export class PoorCommand extends ZapCommand {
    
    protected getPatterns(){
        return ['poor', 'pobre', 'pobrinho', ];
    }

    protected getRules(){
        return [ new GroupOnlyRule() ];
    }

    protected async runSpecificLogic() {
        let { target, id } = this.context;
        return await this.context.client.sendFile(target, resolvePath('assets', 'audios', 'pobre.mp3'), 'pobre', 'pobrinho', id, false, true);
    }
}