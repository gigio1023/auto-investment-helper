import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AgentEvaluationMode =
  | 'prospective-paper-arena'
  | 'historical-episode-replay';
export type AgentEvaluationStatus = 'passed' | 'failed' | 'blocked';

@Entity('agent_evaluation_runs')
@Index(['mode', 'status'])
@Index(['startedAt', 'status'])
export class AgentEvaluationRun {
  @PrimaryColumn()
  runId: string;

  @Column()
  mode: AgentEvaluationMode;

  @Column()
  strategyVariant: string;

  @Column()
  status: AgentEvaluationStatus;

  @Column()
  startedAt: string;

  @Column({ nullable: true })
  completedAt?: string;

  @Column('int')
  horizonHours: number;

  @Column('json')
  symbols: string[];

  @Column()
  promptVersion: string;

  @Column()
  policyVersion: string;

  @Column()
  inputHash: string;

  @Column({ nullable: true })
  outputHash?: string;

  @Column('int')
  decisionCount: number;

  @Column('int')
  blockedCount: number;

  @Column('int')
  abstainedCount: number;

  @Column('json')
  evidenceRefs: string[];

  @Column('json')
  blockerReasons: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
