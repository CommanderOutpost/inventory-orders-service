import { Matches, IsOptional } from 'class-validator';

// Full RFC 3339 timestamp (with timezone), e.g. 2026-10-12T09:30:00Z.
const RFC3339 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export class QuerySummaryDto {
  @IsOptional()
  @Matches(RFC3339, {
    message: 'from must be a valid RFC 3339 timestamp (e.g. 2026-10-12T09:30:00Z)',
  })
  from?: string;

  @IsOptional()
  @Matches(RFC3339, {
    message: 'to must be a valid RFC 3339 timestamp (e.g. 2026-10-12T09:30:00Z)',
  })
  to?: string;
}
