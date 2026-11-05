import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ACTIVE_STATUSES, RenewalRequest } from '../requests/renewal-request.entity.js';
import { Resource } from './resource.entity.js';

@Injectable()
export class ResourcesService {
  constructor(
    @InjectRepository(Resource)
    private readonly resourceRepo: Repository<Resource>,
  ) {}

  async listBySpace(spaceSlug: string): Promise<(Resource & { activeRequest: RenewalRequest | null })[]> {
    const resources = await this.resourceRepo
      .createQueryBuilder('r')
      .innerJoin('r.space', 's')
      .where('s.slug = :slug', { slug: spaceSlug })
      .orderBy('r.externalId')
      .leftJoinAndMapOne(
        'r.activeRequest',
        RenewalRequest,
        'req',
        'req.resourceId = r.id AND req.status IN (:...activeStatuses)',
        { activeStatuses: ACTIVE_STATUSES },
      )
      .getMany();

    return resources as (Resource & { activeRequest: RenewalRequest | null })[];
  }
}
