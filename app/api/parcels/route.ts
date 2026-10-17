import { NextRequest, NextResponse } from 'next/server';
import { lookupDemoParcel } from '@/lib/db';
import { databaseErrorResponse } from '@/lib/db/http';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tracking = searchParams.get('tracking_number');

  try {
    const data = await lookupDemoParcel(tracking ?? '');
    if (!data) {
      return NextResponse.json(
        {
          simulated: true,
          warning: '[SIMULATED DATA] No demo parcel found with this tracking number.',
          tracking_number: tracking,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      simulated: true,
      warning: '[SIMULATED DATA] This is demo data from the database. No real carrier APIs were called.',
      parcel: data,
    });
  } catch (error) {
    return databaseErrorResponse(error, 'Failed to look up demo parcel');
  }
}
