/**
 * MCP Parcel Tools — get_parcel_status, lookup_parcel
 *
 * ⚠️  SIMULATION NOTICE:
 * This tool returns data from the "demo_parcels" table, which is
 * pre-populated with clearly-labelled demo records (simulated: true). It does NOT connect to
 * any real carrier API (FedEx, UPS, USPS, DHL, etc.).
 * All responses include a "simulated: true" flag and a visible warning label.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getMcpDbClient } from '../db.js';

export const ParcelTrackingInputSchema = {
  tracking_number: z
    .string()
    .min(1, 'Tracking number cannot be empty')
    .max(100, 'Tracking number cannot exceed 100 characters')
    .describe('Package tracking number (e.g. DEMO-TRK-001, DEMO-TRK-002, DEMO-TRK-003, DEMO-TRK-004)'),
};

export function parcelTools(server: McpServer) {
  const handleParcelStatus = async ({ tracking_number }: { tracking_number: string }) => {
    try {
      const db = getMcpDbClient();
      const normalizedTrackingNumber = tracking_number.trim().toUpperCase();

      const { data, error } = await db
        .from('demo_parcels')
        .select('*')
        .eq('tracking_number', normalizedTrackingNumber)
        .single();

      if (error || !data) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                simulated: true,
                warning: '[SIMULATED DATA] No parcel found with this tracking number in the simulation database.',
                tracking_number: normalizedTrackingNumber,
                status: null,
              }),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              simulated: true,
              warning: '[SIMULATED DATA] This is demo data. No real carrier APIs were called.',
              parcel: {
                tracking_number: data.tracking_number,
                carrier: data.carrier,
                status: data.status,
                description: data.description,
                estimated_delivery: data.estimated_delivery,
                last_updated: data.last_updated,
              },
              status: data.status,
            }),
          },
        ],
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: 'text' as const,
            text: `Unexpected error retrieving parcel status: ${msg}`,
          },
        ],
        isError: true,
      };
    }
  };

  // ── get_parcel_status (Primary tool required in Phase 3) ───────────────────
  server.tool(
    'get_parcel_status',
    '[SIMULATED] Get current tracking status and delivery estimate for a package. ' +
      'Reads simulated parcel data from the database.',
    ParcelTrackingInputSchema,
    handleParcelStatus
  );

  // ── lookup_parcel (Alias for backwards compatibility) ──────────────────────
  server.tool(
    'lookup_parcel',
    '[SIMULATED] Look up the status of a package by tracking number. ' +
      'Returns data from a local simulation database — not a real carrier API.',
    ParcelTrackingInputSchema,
    handleParcelStatus
  );
}
