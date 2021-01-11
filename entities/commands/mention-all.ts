import { ZapCommand } from "./command";
import { GroupOnlyRule, NArgumentsRule } from "../rules";
import { ArgsOperator } from "../rules/group/n-arguments";
export class MentionAllCommand extends ZapCommand {
    
    protected getPatterns(){
        return ['tnc', 'mentionall', 'all', 'todos',];
    }

    protected getRules(){
        return [ 
            new GroupOnlyRule(), 
            new NArgumentsRule(0, ArgsOperator.EQ), 
        ];
    }

    protected async runSpecificLogic() {
        let { client, target, groupMembers } = this.context;
        return await client.sendReplyWithMentions(target, 'Os seguintes membros tomaram no cu: ' + groupMembers.map(a => '@' + a.replace('@c.us', '') ).join(', ') , this.context.id);
    }
}