import { Injectable } from '@nestjs/common';

@Injectable()
export class OrganizationTimeService {
  businessDate(at: Date, timezone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(at);
    const values = new Map(parts.map((part) => [part.type, part.value]));
    const year = values.get('year');
    const month = values.get('month');
    const day = values.get('day');
    if (year === undefined || month === undefined || day === undefined) {
      throw new RangeError(`Unable to calculate a business date for timezone ${timezone}`);
    }
    return `${year}-${month}-${day}`;
  }
}
