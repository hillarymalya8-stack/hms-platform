# Department dashboard update

The main /dashboard page now shows the hotel summary and department buttons instead of loading every full department workspace in one long page.

Choose Front Office, POS, Inventory, Purchasing, Finance, Reports, Administration, or Offline POS & Sync to open its dedicated page. The main department picker shows only departments permitted for the signed-in account; existing destination-page and API permission checks still apply. The POS terminal shortcut remains available.

Room overview, Latest accounting entry, Payment receipt guide, and System information start closed. Their contents mount only after the relevant button is clicked, and can be closed again. The main summary still loads its existing overview data.

This archive also includes the earlier room-chart/reservation/invoice changes and Everyday Finance. No database migration is required. Deploy using the existing README.md and deployment instructions.

Validation: TypeScript checking and the production web build passed. Five React dashboard checks passed for all department links, finance-only access, administration access, an account without department access, and opening/closing detail content without mounting it in advance. Live server login and browser visual testing were not performed.
