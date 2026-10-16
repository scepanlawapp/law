# My Time Table

## Goal

Add a third My Time presentation alongside the existing weekly board and list.

## Requirements

- Reuse Team Time's table, filters, pagination, and entry actions.
- Always scope My Time table requests to the authenticated user; omit the people selector and user lookup.
- Allow filtering by client, case, status, treatment, and date range independently of weekly navigation.
- Preserve the existing weekly board/list and past-events sidebar.
- Show the large past-events toggle only while collapsed. Expanded desktop and overlay panels use only the top-right header shrink control and devote their full width to content.
- Refresh the active presentation after logging time or changing past work.
- Keep translated accessible view controls and existing theme tokens.
- Size Client and Description with minimum widths of 170px and 200px. Use 1:2 flexible tracks for wider layouts and content-sized tracks for all other columns. Keep horizontal scrolling when the available width cannot fit the minimum tracks.
