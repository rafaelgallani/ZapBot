import { ContactId } from "@open-wa/wa-automate";
import { saveJSON, loadJSON, toMention } from "src/utils";
import { GroupOnlyRule, NArgumentsRule } from "../rules";
import { ArgsOperator } from "../rules/group/n-arguments";
import { ZapCommand } from "./command";
export class AliasCommand extends ZapCommand {
    
    public getPatterns(){
        return ['alias', 'nick', 'nickname'];
    }

    protected getRules(){
        return [ 
            new GroupOnlyRule().override('Só pode ser usado em grupo.'), 
            new NArgumentsRule({ target: 1, operation: ArgsOperator.EQ }), 
        ];
    }

    protected async runSpecificLogic() {
        const { args, groupId, sender } = this.context;
        const [ chosenAlias ] = args;
        if (chosenAlias.length >= 30 || Array.from(chosenAlias)[0] == '@') {
          return await this.context.reply([
            `Apelido inválido:`,
            `  - Tamanho máximo: 30 caracteres;`,
            `  - Não pode ser uma menção.`,
          ].join('\n'));
        }
        const filename = `aliases-group-${groupId}`;
        
        const aliasesHashmap = loadJSON<Record<string, string>>(filename) ?? {};
        const normalizedAliases = Object.values( aliasesHashmap ).map(a => a.toLowerCase());
        if ( chosenAlias === 'list' ) {
          return await this.context.reply(
            Object.entries( aliasesHashmap ).map(([ member, alias ]: [ ContactId, string ]) => `${toMention(member)}: ${alias}`).join('\n')
          );
        }
        
        if ( normalizedAliases.includes( chosenAlias.toLowerCase() ) ) {
            return await this.context.reply(`O apelido ${chosenAlias} já foi escolhido por outro membro. Escolha outro apelido.`);
        }

        if ( ['reset', 'delete', 'remove'].includes( chosenAlias.toLowerCase() ) ) {
            delete aliasesHashmap[ sender.id ];
            saveJSON(filename, aliasesHashmap);

            return await this.context.reply(
              `Seu apelido foi removido.`
            );
        }

        aliasesHashmap[ sender.id ] = chosenAlias;
        saveJSON( filename, aliasesHashmap );

        return await this.context.reply(`Seu apelido foi definido como "${chosenAlias}".`);
    }
}