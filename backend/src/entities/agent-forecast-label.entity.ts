import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export type AgentForecastLabelStatus = 'labeled' | 'blocked';
export type AgentForecastDirection = 'up' | 'down' | 'flat' | 'unknown';

@Entity('agent_forecast_labels')
@Index(['decisionId', 'status'])
@Index(['symbol', 'horizonEnd'])
export class AgentForecastLabel {
  @PrimaryColumn()
  id: string;

  @Column()
  decisionId: string;

  @Column()
  runId: string;

  @Column()
  symbol: string;

  @Column()
  labelAsOf: string;

  @Column()
  horizonEnd: string;

  @Column()
  status: AgentForecastLabelStatus;

  @Column()
  actualDirection: AgentForecastDirection;

  @Column('float', { nullable: true })
  realizedReturnBps?: number;

  @Column('float')
  forecastProbabilityUp: number;

  @Column('float', { nullable: true })
  brierScore?: number;

  @Column('float', { nullable: true })
  logScore?: number;

  @Column('json')
  evidenceRefs: string[];

  @Column('json')
  blockerReasons: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
