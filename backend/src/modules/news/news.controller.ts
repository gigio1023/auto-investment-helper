import { Controller, Get, Query, Param } from '@nestjs/common';
import { NewsService } from './news.service';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Get('stats')
  async getNewsStats(): Promise<any> {
    return this.newsService.getNewsStats();
  }

  @Get('recent')
  async getRecentNews(@Query('hours') hours: string = '24'): Promise<any> {
    const hoursNum = parseInt(hours, 10) || 24;
    return this.newsService.getRecentNews(hoursNum);
  }

  @Get('category/:category')
  async getNewsByCategory(@Param('category') category: string): Promise<any> {
    return this.newsService.getNewsByCategory(category);
  }

  @Get('unprocessed')
  async getUnprocessedNews(): Promise<any> {
    return this.newsService.getUnprocessedNews();
  }
}
