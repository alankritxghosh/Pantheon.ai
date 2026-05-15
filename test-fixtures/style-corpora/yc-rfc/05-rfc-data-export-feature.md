# RFC: Data Export Feature

## Problem

Customers keep asking whether they can export task-batch history before they have even created many batches. The ask is partly compliance, but mostly trust. They want to know they are not putting engineering workflow data into a one-way system.

Right now we can export data manually from the database, but that is not a product answer. It creates support work, delays procurement, and makes us look less mature than we are. The absence of export also blocks security reviews because reviewers treat "email us" as a weak control.

## Proposal

We propose a workspace-level export button for admins. Version one exports batch definitions, batch run history, task metadata, assignees, and digest delivery status as CSV files inside a zip. It does not export raw source code, repository contents, or third-party comments. We should be explicit about that boundary.

The export should be asynchronous. Admin clicks "Export workspace data," gets a confirmation screen, and receives an email when the zip is ready. Links expire after seven days. We should also write an audit event when an export is requested and when it is downloaded.

This is not a reporting feature. We should resist charting, filters, and scheduled exports in v1. The job is portability and procurement confidence.

## Open Questions

Should exports include deleted batches, or only active and archived ones?

Do we need customer-controlled encryption keys before enterprise buyers accept this?

What retention policy should apply to generated zip files after expiration?
