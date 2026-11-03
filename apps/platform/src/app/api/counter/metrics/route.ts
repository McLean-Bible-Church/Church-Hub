import { NextResponse } from 'next/server';
import { requireApiAppAccess } from '@/lib/apiAuth';
import { getMetrics } from '@/services/counterService';

export async function GET() {
  try {
    const access = await requireApiAppAccess('counter', 'view');
    if (!access.ok) return access.response;

    const metrics = await getMetrics();

    return NextResponse.json(metrics);
  } catch (error) {
    console.error('Error fetching metrics:', error);
    return NextResponse.json({ error: 'Failed to fetch metrics' }, { status: 500 });
  }
}
