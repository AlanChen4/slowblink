import { net } from 'electron';
import {
  cloudAuthHeaders,
  requireCloudEndpoint,
} from '../../../cloud/endpoint';
import type {
  ClassificationProvider,
  ClassifiedSegment,
  ClassifyBatchRequest,
  ProposedTaxonomyAdditions,
  TaxonomyRequest,
} from '../types';

interface TaxonomyResponse {
  blocked?: boolean;
  reason?: string;
  newCategories?: { name: string; subcategories: string[] }[];
  newSubcategories?: { parentCategory: string; subcategory: string }[];
}

interface ClassifyResponse {
  blocked?: boolean;
  reason?: string;
  classifications?: ClassifiedSegment[];
}

async function callJson<T>(endpoint: string, body: unknown): Promise<T> {
  const res = await net.fetch(endpoint, {
    method: 'POST',
    headers: { ...cloudAuthHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Cloud classification returned ${res.status}`);
  }
  return (await res.json()) as T;
}

export function createCloudProxyProvider(): ClassificationProvider {
  return {
    async generateTaxonomy(
      req: TaxonomyRequest,
    ): Promise<ProposedTaxonomyAdditions | { blocked: true; reason: string }> {
      const endpoint = requireCloudEndpoint(
        'classify-taxonomy',
        'classify-taxonomy',
      );
      const data = await callJson<TaxonomyResponse>(endpoint, {
        existingTaxonomy: req.existingTaxonomy,
        segments: req.segments,
        model: req.model,
      });
      if (data.blocked) {
        return { blocked: true, reason: data.reason ?? 'unknown' };
      }
      return {
        newCategories: data.newCategories ?? [],
        newSubcategories: data.newSubcategories ?? [],
      };
    },
    async classifyBatch(
      req: ClassifyBatchRequest,
    ): Promise<ClassifiedSegment[] | { blocked: true; reason: string }> {
      const endpoint = requireCloudEndpoint(
        'classify-segments',
        'classify-segments',
      );
      const data = await callJson<ClassifyResponse>(endpoint, {
        taxonomy: req.taxonomy,
        segments: req.segments,
        model: req.model,
      });
      if (data.blocked) {
        return { blocked: true, reason: data.reason ?? 'unknown' };
      }
      if (!Array.isArray(data.classifications)) {
        throw new Error('Cloud classification returned malformed body');
      }
      return data.classifications;
    },
  };
}
