import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('news_sources')
export class NewsSource {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column('text')
  content: string;

  @Column()
  url: string;

  @Column()
  source: string;

  @Column('datetime')
  publishedAt: Date;

  @Column('json', { nullable: true })
  tags: string[];

  @Column({ nullable: true })
  category: string;

  @Column({ default: false })
  processed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
