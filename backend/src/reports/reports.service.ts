import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../config/configuration';
import { QuerySummaryDto } from './dto/query-summary.dto';

const REQUEST_TIMEOUT_MS = 5_000;

@Injectable()
export class ReportsService {
  private readonly baseUrl: string;

  constructor(configService: ConfigService) {
    this.baseUrl = configService.getOrThrow<AppConfig>('app').reportingServiceUrl;
  }

  /**
   * Fetches the aggregated order summary from the standalone Golang
   * reporting microservice. The API stays a thin proxy so the Go service
   * owns the aggregation query.
   */
  async getOrderSummary(query: QuerySummaryDto): Promise<unknown> {
    const params = new URLSearchParams();
    if (query.from) params.set('from', query.from);
    if (query.to) params.set('to', query.to);
    const queryString = params.toString();
    const url = `${this.baseUrl}/api/v1/summary/orders${
      queryString ? `?${queryString}` : ''
    }`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });

      if (!response.ok) {
        // The upstream responded, but with an error — that's a gateway problem.
        throw new BadGatewayException(
          `Reporting service responded with status ${response.status}`,
        );
      }
      return await response.json();
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Reporting service is unavailable. Is the Golang microservice running?',
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

