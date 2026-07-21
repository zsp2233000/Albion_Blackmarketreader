# Publish through CLI instead of a Dashboard action

**Status: accepted**

The first version exposes manual publication through a CLI or PowerShell command. The command writes the JSON projection and reports a change summary, but does not commit or push. The Dashboard has no publication button. This keeps publication explicit and reviewable and prevents an accidental UI action from changing the repository.
