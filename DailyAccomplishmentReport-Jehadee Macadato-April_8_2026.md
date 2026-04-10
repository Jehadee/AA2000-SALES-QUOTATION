Daily Accomplishment Report
Name: Jehadee L. Macadato
Date: Apr 8, 2026
Time Coverage: 9:00 am - 6:00 pm
Task: Sales Quotation System Development

Activity Timeline
Time | Activity
--- | ---
9:00 AM - 10:30 AM | Validated role-based UI access and confirmed Admin Console visibility rules for sales users. Reviewed dashboard navigation behavior and user-role rendering logic.
10:30 AM - 12:00 PM | Enhanced Estimation Inbox empty-state handling. Updated estimation file fetch behavior so database-empty/404 responses return an empty list instead of error blocking, improving UX when files are removed on server.
1:00 PM - 2:30 PM | Investigated Quotation Studio post-submit reset behavior and identified residual defaults causing workspace to appear not fully cleared. Refined reset path in pipeline submit flow.
2:30 PM - 4:00 PM | Implemented full blank reset after pipeline submit using normalized cleared customer state and discount defaults. Persisted reset state immediately to avoid stale form repopulation after refresh.
4:00 PM - 5:00 PM | Cleaned Quotation Studio actions by removing duplicate "Submit to Pipeline" button and retaining single submit path for clearer interaction.
5:00 PM - 6:00 PM | Regression-tested quotation submit, estimation empty state, and UI stability across preview/pipeline flow. Verified build/lint success after all updates.

Accomplishment
- Confirmed and maintained role-based hiding of Admin Console for sales users.
- Improved Estimation Inbox resilience by treating all-404 list responses as empty state.
- Corrected workspace reset behavior so Quotation Studio becomes truly blank after successful pipeline submit.
- Persisted blank/reset app state to prevent old data from reappearing.
- Removed duplicate submit control in Quotation Studio for cleaner and less error-prone workflow.
- Completed stability checks and successful build verification after changes.

Challenges / Notes
- Backend file deletion states can return hard 404, which previously surfaced as fetch failure; this required graceful empty-list interpretation without masking real server errors.
- Reset behavior needed careful handling of default customer type and manual-discount flags to avoid implicit recalculation after submit.
- UI changes required consistency checks across normal and headless preview/pipeline submission paths.

Prepared By: Jehadee L. Macadato
