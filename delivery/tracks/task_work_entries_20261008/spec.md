# Specification

Tasks support multiple work entries. Task cards provide Add work; task details show a separate section with Add work and a paginated list of linked entries under existing work-entry permissions. Logging work does not change task status. Completion still opens prefilled quick capture; when linked work exists, an additional Finish task without new work action completes the task without inserting work. The server validates that work exists. Save with new work remains atomic. Preserve/backfill existing task-source entries and other source uniqueness rules.
