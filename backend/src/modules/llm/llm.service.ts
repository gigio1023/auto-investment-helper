import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export enum LlmModel {
  GEMINI_2_5_PRO_PREVIEW = 'gemini-2.5-pro-preview-06-05',
  GPT_4_1_NANO = 'gpt-4.1-nano',
}

@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private openai: OpenAI;
  private geminiClient: OpenAI;

  constructor(private configService: ConfigService) {
    // OpenAI 클라이언트 (보조 모델)
    const openaiKey = this.configService.get('OPENAI_API_KEY');
    if (openaiKey) {
      this.openai = new OpenAI({
        apiKey: openaiKey,
      });
    }

    // Gemini를 OpenAI 호환 형태로 사용 (주 모델)
    const geminiKey = this.configService.get('GEMINI_API_KEY');
    if (geminiKey) {
      this.geminiClient = new OpenAI({
        apiKey: geminiKey,
        baseURL: this.configService.get(
          'GEMINI_BASE_URL',
          'https://generativelanguage.googleapis.com/v1beta/openai/',
        ),
        timeout: 30000, // 30초 타임아웃
      });
    }
  }

  async generateInvestmentAnalysis(
    prompt: string,
    useGemini = true,
    retryCount = 0,
  ): Promise<string> {
    const maxRetries = 3;

    try {
      const client =
        useGemini && this.geminiClient ? this.geminiClient : this.openai;
      const model = useGemini
        ? LlmModel.GEMINI_2_5_PRO_PREVIEW
        : LlmModel.GPT_4_1_NANO;

      if (!client) {
        this.logger.warn(
          'LLM 클라이언트가 설정되지 않았습니다. 기본 메시지를 반환합니다.',
        );
        return this.getDefaultAnalysisMessage(prompt);
      }

      this.logger.log(
        `${useGemini ? 'Gemini' : 'OpenAI'} 모델(${model})로 투자 분석 시작 (시도: ${retryCount + 1})`,
      );

      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt(),
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 3000,
      });

      const result = response.choices[0].message.content || '';
      if (!result || result.length < 100) {
        throw new Error('생성된 분석 내용이 너무 짧습니다.');
      }

      this.logger.log('투자 분석 생성 완료');
      return result;
    } catch (error) {
      this.logger.error(
        `LLM API 오류 (시도 ${retryCount + 1}):`,
        error.message,
      );

      // Rate limit 오류 시 대기 후 재시도
      if (error.status === 429 && retryCount < maxRetries) {
        const waitTime = Math.pow(2, retryCount) * 1000; // 지수 백오프
        this.logger.warn(`Rate limit 도달, ${waitTime}ms 대기 후 재시도`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.generateInvestmentAnalysis(
          prompt,
          useGemini,
          retryCount + 1,
        );
      }

      // Gemini 실패 시 OpenAI로 폴백 (한 번만)
      if (useGemini && this.openai && retryCount === 0) {
        this.logger.warn('Gemini 실패, OpenAI로 폴백 시도');
        return this.generateInvestmentAnalysis(prompt, false, 0);
      }

      // 최후의 대안: 기본 메시지 반환
      if (retryCount >= maxRetries) {
        this.logger.error('모든 재시도 실패, 기본 메시지 반환');
        return this.getDefaultAnalysisMessage(prompt);
      }

      throw new Error('투자 분석 생성 중 오류가 발생했습니다.');
    }
  }

  private getDefaultAnalysisMessage(prompt: string): string {
    const today = new Date().toLocaleDateString('ko-KR');

    return `# ${today} 투자 분석 리포트

## ⚠️ 시스템 알림
현재 AI 분석 서비스에 일시적인 문제가 발생하여 자동 분석을 완료할 수 없습니다.

## 📊 기본 투자 가이드라인

### 27세 가치 투자자를 위한 기본 원칙
1. **장기 투자 관점 유지**: 최소 3-5년 이상의 투자 기간 고려
2. **안전 마진 확보**: 내재 가치 대비 충분한 할인된 가격에서 매수
3. **포트폴리오 분산**: 섹터별, 지역별, 시간대별 분산 투자
4. **인플레이션 헤지**: 실질 구매력 보호를 위한 자산 배분

### 권장 행동
- 시장 동향 지속 모니터링
- 기업 펀더멘털 분석 우선
- 감정적 판단보다 데이터 기반 의사결정
- 정기적인 포트폴리오 리밸런싱

*자동 분석 서비스가 복구되는 대로 상세한 투자 인사이트를 제공하겠습니다.*`;
  }

  async summarizeNews(newsItems: any[]): Promise<string> {
    if (!newsItems || newsItems.length === 0) {
      return '분석할 새로운 뉴스가 없습니다.';
    }

    const newsText = newsItems
      .map(
        (item) =>
          `제목: ${item.title}\n내용: ${item.content}\n출처: ${item.source}\n발행일: ${item.publishedAt}`,
      )
      .join('\n\n---\n\n');

    const prompt = `다음 ${newsItems.length}개의 최신 뉴스를 27세 가치 투자자 관점에서 분석해주세요:

${newsText}

분석 요청 사항:
1. 주요 경제/금융 이슈 요약
2. 중장기 가치 투자에 미칠 영향 분석
3. 인플레이션 대비 및 자산 증식 관점에서의 시사점
4. 포트폴리오 다각화를 위해 주의깊게 봐야 할 섹터나 자산
5. 리스크 요인 및 기회 요소 식별
6. 27세 투자자가 고려해야 할 장기적 투자 전략

분석은 보수적이고 신중한 관점에서 작성해주세요.`;

    return this.generateInvestmentAnalysis(prompt);
  }

  private getSystemPrompt(): string {
    return `당신은 27세 개인 투자자를 위한 전문적인 투자 분석가입니다.

## 투자자 프로필
- 나이: 27세 (젊은 투자자)
- 투자 성향: 안전한 가치 투자 중심
- 투자 목표: 인플레이션 대비 + 장기 자산 증식
- 투자 기간: 중장기 투자 (단타 투자 배제)
- 수입 활용: 수입의 상당 부분을 투자로 활용

## 핵심 투자 철학
1. **가치 투자 우선**: 내재 가치 대비 저평가된 자산 선별
2. **안전 마진 확보**: 보수적이고 신중한 투자 접근
3. **장기적 관점**: 최소 3-5년 이상의 투자 기간 고려
4. **인플레이션 헤지**: 실질 구매력 보호 및 증대
5. **포트폴리오 다각화**: 시간대별, 자산별, 지역별 분산
6. **지속적 학습**: 시장 변화에 대한 지속적 모니터링

## 투자 분석 원칙
- **리스크 관리**: 손실 최소화를 우선으로 고려
- **펀더멘털 분석**: 기업과 경제의 기본적 가치 중심
- **장기 트렌드**: 단기 변동보다 장기적 패턴에 집중
- **글로벌 관점**: 국내외 시장 모두 고려
- **실용성**: 27세 개인이 실제 실행 가능한 전략 제시

## 응답 스타일
- 한국어로 작성
- 전문적이면서도 이해하기 쉽게 설명
- 구체적이고 실행 가능한 조언 제공
- 리스크와 기회를 균형있게 제시
- 보수적 관점을 기본으로 하되, 성장 기회도 놓치지 않음

분석 시 항상 "27세 가치 투자자"의 관점을 유지하고, 장기적 자산 증식과 인플레이션 대비를 염두에 두고 조언해주세요.`;
  }
}
