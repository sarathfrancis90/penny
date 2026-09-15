# Native search prompt at AX5

A focused native search field becomes 223pt wide when its Cancel control is present on iPhone 16e at actual system AX5. The app-owned prompt “Search your expenses” visibly compresses to much smaller text to fit. Shortening it to “Search” lets the prompt remain visibly large within that same field. This is the only production change, in ExpensesView.swift; native search, filtering and keyboard behavior are retained.

| Focused AX5 before | Focused AX5 after |
|---|---|
| ![Long prompt compressed](a11y-search-prompt-before.png) | ![Short prompt remains large](a11y-search-prompt-after.png) |

The unchanged-source and changed-source keyboard journeys each passed 1/1: focus, enter the full query, assert exact value, dismiss keyboard and reach the no-match result. Each side also ran the complete unfiltered Expenses/Reports/Vault diagnostic. **Both audits fail with the same 13 findings: 10 Dynamic Type, 2 clipping, 1 contrast.** The native search clipping warning remains; this visual fix does not clear or reclassify it. No filtering, suppression, font cap or gesture retry was introduced.

Independent review found no further justified source correction among the remaining original findings: prior actual-system screenshots show the device label and empty/report/backup texts growing and wrapping; the reported capacity-heading contrast frame remains partly offscreen at y830–870 on an 844pt screen. Those observations do not convert a failing diagnostic into release acceptance. No speculative global font/style changes were made.

Current-source runs use the separate ca.penny.offline.a11y.current identity on owned F70 iPhone 16e, iOS 26.4.1, Xcode 26.6, Debug. Normal demo and UI readiness tests were untouched. Runtime evidence is in apps/ios/.build/a11y-current/{Baseline,AfterAudit,AX5Search,AfterSearch}.xcresult; the paired JSON records exact source/binary/harness hashes, commands and all 13 findings. The initial content-size read while shutdown returned unknown; a final booted check exposed that restoration was ineffective, so large (the prior documented baseline) was explicitly set and read back before shutdown. We do not claim a directly observed initial setting.

This closes one visible prompt-compression issue. It is not a passing accessibility audit, full functional suite, populated-search test or physical VoiceOver proof. Remaining release accessibility gates stay open.
