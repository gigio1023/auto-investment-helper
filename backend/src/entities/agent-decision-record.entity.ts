import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AgentDecisionStatus = 'proposed' | 'abstained' | 'blocked';
export type AgentDecisionDirection = 'up' | 'down' | 'flat';

@Entity('agent_decision_records')
@Index(['runId', 'status'])
@Index(['symbol', 'asOf'])
@Index(['strategyVariant', 'availableAt'])
export class AgentDecisionRecord {
  @PrimaryColumn()
  id: string;

  @Column()
  runId: string;

  @Column()
  strategyVariant: string;

  @Column()
  agentId: string;

  @Column()
  symbol: string;

  @Column()
  asOf: string;

  @Column()
  availableAt: string;

  @Column('int')
  horizonHours: number;

  @Column()
  status: AgentDecisionStatus;

  @Column()
  direction: AgentDecisionDirection;

  @Column('float')
  forecastProbabilityUp: number;

  @Column('float', { nullable: true })
  expectedReturnBps?: number;

  @Column('float')
  confidence: number;

  @Column({ nullable: true })
  thesis?: string;

  @Column({ nullable: true })
  counterThesis?: string;

  @Column({ nullable: true })
  invalidationCondition?: string;

  @Column('json')
  proposedAction: Record<string, unknown>;

  @Column('json')
  riskNotes: string[];

  @Column('json')
  sourceSnapshotRefs: string[];

  @Column('json')
  evidenceRefs: string[];

  @Column()
  model: string;

  @Column()
  promptVersion: string;

  @Column()
  policyVersion: string;

  @Column()
  toolPolicyVersion: string;

  @Column()
  memoryPolicyVersion: string;

  @Column()
  inputHash: string;

  @Column()
  outputHash: string;

  @Column('json')
  blockerReasons: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
