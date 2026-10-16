# Responsive Sidebar Children

## Goal

Reserve right-side child-route dropdowns for the collapsed desktop sidebar.
This corrects the expanded and mobile behavior introduced by the parent track.

## Requirements

- Expanded desktop and mobile parents reveal inline child links through an accessible disclosure.
- Collapsed desktop parents retain dropdowns without navigating or expanding the sidebar.
- Preserve translated labels, role filtering, active parents/current children, direct links, and mobile closing after child selection.
- Mobile uses inline children even when the saved desktop state is collapsed.
