# Chat demo app (Next.js)

Implementation details, run instructions, mock env vars, HTTP routes, and UI notes live in **`chat_v1.md`**:

| Topic | Location in `chat_v1.md` |
|--------|---------------------------|
| Local run, stack, API paths, extra UI notes | **Appendix A §A.9** (end of document) |
| Mock ML stream pacing (`ENABLE_MOCK_ML_DELAYS`) | First Appendix A **§A.3.1** |
| SSE drop + `get-history` polling (`ENABLE_MOCK_SSE_*`, `HISTORY_POLL_*`) | First Appendix A **§A.3.2** |
| Turn state / `sourceMessageState` | End Appendix A **§A.0** |
| Demo mode (`/chat?demo=true`) | End Appendix A **§A.6** (see also first Appendix **§A.6**) |
| Broader mock flow coverage | End Appendix A **§A.5** |

The spec remains the main contract; **`chat_v1.md`** is the single canonical place for spec + chat-demo implementation notes.
