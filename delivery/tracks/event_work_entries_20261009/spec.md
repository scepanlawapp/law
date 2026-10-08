# Event work entries

Events support multiple linked work entries, visible and manageable from the event dialog. Work / Time shows only ended events without any linked work entries. Event Write off records confirmed non-billable work directly, without a reason dialog. The API exposes hasWorkEntry from the actual relationship. Existing work links remain intact. When no unique client can be inferred, capture asks for the required client with non-billable treatment preselected.
