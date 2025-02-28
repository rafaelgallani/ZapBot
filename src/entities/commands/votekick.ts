import { ContactId } from "@open-wa/wa-automate";
import { Mention, Vote, VoteOption, VotingResult } from "src/types";
import { fullTrim, isMention, loadJSON, saveJSON, toContactId } from "src/utils";
import { AllowBotArgumentRule, ArgumentFormat, ArgumentFormatterRule, BotAdminRule, GroupOnlyRule, NArgumentsRule, SelfReferenceRule } from "../rules";
import { ArgsOperator } from "../rules/group/n-arguments";
import { ZapCommand } from "./command";
export class VotekickCommand extends ZapCommand {
    
    private data: Record<Mention, VotingResult>;
    private defaultVote = 'sim';

    public getPatterns(){
        return ['votekick', 'vote', 'voteban', 'votação', 'votar', 'voto'];
    }

    protected getRules(){
        return [ 
            new GroupOnlyRule(), 
            new BotAdminRule().override('Bot precisa ser admin pra fazer votação/kick.'), 
            new AllowBotArgumentRule(false).override('Olha o ban...'), 
            new SelfReferenceRule().override('Você não pode participar numa votação de si mesmo.'), 
            new NArgumentsRule(
                { target: 2, operation: ArgsOperator.LTE },
                { target: 1, operation: ArgsOperator.GTE },
            ), 
            // new ArgumentFormatterRule([
            //    new ArgumentFormat(isMention, 0).override('O primeiro parâmetro do seu voto deve ser uma menção à algum membro.'),
            // ])
        ];
    }

    private async saveWithReply(message: string){
        saveJSON(`votekick-group-${this.context.groupId}`, this.data);
        return await this.context.reply(message);
    }

    private getVoteOptionMessage( voteData: VotingResult, option: 'KICK' | 'KEEP' ) {
        if ( option === "KICK" ) {
            return `Banir: ${voteData.shouldKick}/${voteData.votesNeeded}`;
        } else {
            return `Não banir: ${voteData.shouldKeep}/${voteData.votesNeeded}`;
        }
    }

    private getVoteMessage( voteData: VotingResult, shouldBeKicked: boolean | undefined = undefined ) {
        if ( undefined === shouldBeKicked ) {
            return [
              this.getVoteOptionMessage( voteData, 'KICK' ),
              this.getVoteOptionMessage( voteData, 'KEEP' ),
            ].join("\n");
        }

        return [
            `${shouldBeKicked?  '✅' : '❌'} - ${this.getVoteOptionMessage( voteData, 'KICK' )}`,
            `${!shouldBeKicked? '✅' : '❌'} - ${this.getVoteOptionMessage( voteData, 'KEEP' )}`,
            '',
            `O membro ${shouldBeKicked? 'será' : 'não será'} banido!!!`,
        ].join("\n");
    }

    private getVoteMessages() {
        const results = [];

        for( const votingData of Object.values( this.data ) ) {
            results.push(
              [
                `Membro: ${ votingData.target }`,
                this.getVoteOptionMessage( votingData, 'KICK' ),
                this.getVoteOptionMessage( votingData, 'KEEP' ),
              ].join("\n")
            );
        }
        return results;
    }

    protected async runSpecificLogic() {
        const { groupId, sender, args } = this.context;
        this.data = loadJSON < Record<Mention, VotingResult> >(`votekick-group-${groupId}`);
        if (!this.data) this.data = {};

        const target = args[0];

        if ( !isMention( target ) ) {
            if ( 'list' === target ) {
                const votingResults = this.getVoteMessages();

                return await this.saveWithReply(
                  fullTrim(`
                    Votações abertas:
                    
                    ${ votingResults.join('\n\n') }
                  `)
                );
            } else {
                return await this.context.reply('Argumento inválido. Mencione um membro ou use "list" pra listar as votações.');
            }
        }

        const votingTarget = args[0] as Mention;
        
        const [ voteData, message ] = this.createVoting(votingTarget, sender.id);
        
        if ( !message ) {
            await this.saveWithReply(fullTrim(`
                Votação iniciada, votekick no membro ${votingTarget}
                
                ${ this.getVoteMessage(voteData) }
            `));
        } else {
            // Voting already started. Process vote...
            const option = args[1] ?? this.defaultVote;
            
            const vote = this.parseVoteOption( option );
            if (!vote.valid) return await this.saveWithReply(vote.errorMessage);

            const voteResult = this.doVote( voteData, sender.id, vote.option );
            if (!voteResult.valid) return await this.saveWithReply(voteResult.errorMessage);

            const { updatedResult } = voteResult;

            if ( !updatedResult.done ){
                return await this.saveWithReply(fullTrim(`
                    Votação atualizada: ${votingTarget}
                    
                    ${ this.getVoteMessage( updatedResult ) }
                `));
            } else {
                const shouldKick = updatedResult.kicked;

                await this.saveWithReply(fullTrim(`
                    Votação encerrada: ${votingTarget}
                    
                    ${ this.getVoteMessage( updatedResult, shouldKick )}
                `));
                
                if (shouldKick) {
                    await this.context.client.removeParticipant(groupId, toContactId(votingTarget));
                }

                this.endVoting(votingTarget);
            }
        }
        saveJSON(`votekick-group-${this.context.groupId}`, this.data);
    }

    createVoting(target: Mention, from: ContactId) : [ VotingResult, string ]{
        const votingMap = this.data;

        if (votingMap[target]){
            const voting = votingMap[target];
            return [ voting, `Já há um votekick nesse membro. Votação:\n\nBanir: ${voting.shouldKick}/${voting.votesNeeded}\nNão banir: ${voting.shouldKeep}/${voting.votesNeeded}` ];
        }
    
        votingMap[target] = {
            target,
            shouldKick: 1,
            shouldKeep: 0,
            done: false,
            votes: [from],
            votesNeeded: 5,
        };
    
        return [ votingMap[target], null ];
    };
    
    doVote(voting: VotingResult, whoVoted: ContactId, kick=true): Vote {
        if ( voting.votes.includes(whoVoted) ){
            return { valid: false, errorMessage: 'Você já votou.' }
        }
    
        voting.votes.push(whoVoted);
    
        if (kick) voting.shouldKick += 1;
        else voting.shouldKeep += 1;
    
        if (voting.shouldKick >= voting.votesNeeded){
            voting.kicked = true;
            voting.done = true;
        } else if (voting.shouldKeep >= voting.votesNeeded){
            voting.kicked = false;
            voting.done = true;
        } 

        this.data[voting.target] = voting;
        return { valid: true, updatedResult: voting };
    };
    
    parseVoteOption(option): VoteOption {
        const vote = option.trim().toLowerCase();
    
        const shouldKickValidVotes = ['s', 'y', 'ss', 'sss', 'sim', 'yes', '👍', '👍🏿', '👍🏻', '👍🏽', '👍🏾', '👍🏼'],
            shouldNotKickValidVotes = ['n', 'n', 'nn', 'no', 'nnn', 'nao', 'não', 'nem', 'ñ', '👎','👎🏻','👎🏼','👎🏽','👎🏾','👎🏿'];
    
        if (shouldKickValidVotes.includes(vote)){
            return { valid: true, option: true };
        }
    
        if (shouldNotKickValidVotes.includes(vote)){
            return { valid: true, option: false };
        }
    
        const invalidVoteMessage = fullTrim(`
            Voto inválido.
            
            Votos válidos: 
            
            A favor:
            
            ${shouldKickValidVotes.join(` | `)}
            
            Contra: 
            
            ${shouldNotKickValidVotes.join(` | `)}
        `);
    
        return { valid: false, option: null, errorMessage: invalidVoteMessage };
    };

    endVoting(voteTarget: Mention){
        delete this.data[voteTarget]
    };
}