import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AgenciesService } from './agencies.service';

/** The office map must know where the office is, whether or not the agency has been verified. */
function serviceWith(agency: { id: string; lat: number | null; lng: number | null } | null) {
  const findUnique = vi.fn().mockResolvedValue(agency);
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { agency: { findUnique }, property: { findMany } };
  return { service: new AgenciesService(prisma as never, { days: 30, listings: 10 }), findUnique };
}

describe('AgenciesService.listMapListings: the office pin', () => {
  it('returns the agency pin next to its listings', async () => {
    const { service, findUnique } = serviceWith({ id: 'a1', lat: 34.5553, lng: 69.2075 });
    const result = await service.listMapListings('u1');
    expect(result.office).toEqual({ lat: 34.5553, lng: 69.2075 });
    expect(result.data).toEqual([]);
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1' }, select: { id: true, lat: true, lng: true } }));
  });

  it('returns null while the agency has not placed a pin', async () => {
    const { service } = serviceWith({ id: 'a1', lat: null, lng: null });
    expect((await service.listMapListings('u1')).office).toBeNull();
  });

  it('still refuses a user without an agency', async () => {
    const { service } = serviceWith(null);
    await expect(service.listMapListings('u1')).rejects.toBeInstanceOf(NotFoundException);
  });
});
