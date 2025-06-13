import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('reports')
export class Report {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column('text')
  summary: string;

  @Column('json', { nullable: true })
  marketData: any;

  @Column('json', { nullable: true })
  newsAnalysis: any;

  @Column('json', { nullable: true })
  investmentRecommendations: any;

  @Column({ default: 'morning' })
  reportType: 'morning' | 'evening';

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
