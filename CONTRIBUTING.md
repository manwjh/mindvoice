# Contributing to MindVoice

Thank you for your interest in contributing to MindVoice! This document provides guidelines and instructions for contributing to this multi-app voice assistant project.

**Project Version**: 1.0.0 | **Last Updated**: 2025-12-31

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences
- Follow the project's coding standards and conventions

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/yourusername/mindvoice/issues)
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment information (OS, Python version, Node.js version)
   - Screenshots if applicable

### Suggesting Features

1. Check if the feature has already been suggested
2. Create a new issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Possible implementation approach (if you have ideas)

### Submitting Pull Requests

1. **Fork the repository** and create a new branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**:
   - Follow the existing code style
   - Add comments for complex logic
   - Update documentation if needed
   - Add tests if applicable

3. **Test your changes**:
   - Ensure all existing tests pass
   - Test your new functionality
   - Test on different platforms if possible

4. **Commit your changes**:
   ```bash
   git commit -m "Add: description of your changes"
   ```
   Use clear, descriptive commit messages.

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**:
   - Provide a clear description of your changes
   - Reference any related issues
   - Wait for review and address feedback

## Development Setup

1. **Clone your fork**:
   ```bash
   git clone https://github.com/yourusername/mindvoice.git
   cd mindvoice
   ```

2. **Set up Python virtual environment** (Important: Always use venv):
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Set up Node.js environment**:
   ```bash
   cd electron-app
   npm install
   cd ..
   ```

4. **Configure services**:
   ```bash
   cp config.yml.example config.yml
   # Edit config.yml with your own credentials:
   # - ASR: Volcano Engine credentials
   # - LLM: Your LLM API key and model
   ```

5. **Start development**:
   ```bash
   # Use the quick start script
   ./quick_start.sh
   
   # Or manually:
   # Terminal 1: Start API server
   source venv/bin/activate
   python api_server.py
   
   # Terminal 2: Start frontend
   cd electron-app
   npm run dev
   ```

6. **Stop services**:
   ```bash
   ./stop.sh
   ```

## Code Style

### Python
- **Follow PEP 8** style guide
- **Use type hints** for function parameters and return types
- **Add docstrings** for public functions and classes (Google style)
- **Virtual environment**: Always run Python commands inside venv
- **Naming conventions**:
  - Classes: `PascalCase` (e.g., `VoiceService`)
  - Functions/variables: `snake_case` (e.g., `start_recording`)
  - Constants: `UPPER_SNAKE_CASE` (e.g., `API_BASE_URL`)

### TypeScript/React
- **Follow React best practices** - Use functional components and Hooks
- **TypeScript types** - Avoid `any`, use specific types
- **Component naming**: `PascalCase` (e.g., `VoiceNote.tsx`)
- **Props interface**: `ComponentNameProps`
- **CSS files**: Same name as component (e.g., `VoiceNote.css`)
- **Naming conventions**:
  - Boolean variables: Use `is/has/should` prefix (e.g., `isConnected`)
  - Event handlers: Use `handle` prefix (e.g., `handleClick`)

### Git Commit Messages

Follow this format:
```
<type>(<scope>): <subject>

type: feat|fix|docs|style|refactor|test|chore
scope: component|api|asr|llm|ui
subject: Brief description (in Chinese or English)
```

Examples:
```
feat(ui): Add Zen application
fix(asr): Fix WebSocket reconnection issue
docs(readme): Update installation instructions
refactor(llm): Improve error handling
```

## Project Structure

```
src/                  # Python backend
├── api/              # FastAPI endpoints
├── core/             # Core modules (config, plugin manager)
├── providers/        # ASR, LLM, Storage providers
├── services/         # Business logic services
├── prompts/          # AI role prompts
└── utils/            # Utility modules

electron-app/         # Electron frontend
├── src/
│   ├── components/
│   │   ├── apps/     # Application components (VoiceNote, SmartChat, VoiceZen)
│   │   └── shared/   # Shared components (Sidebar, Toast, etc.)
│   ├── utils/        # Frontend utilities
│   └── version.ts    # Global version configuration
└── electron/         # Electron main process

docs/                 # Documentation
```

## Important Coding Rules

Please read and follow these project-specific rules:

1. **Version Management**: 
   - Only modify version in `electron-app/src/version.ts`
   - Use `./scripts/update_version.sh` script for version updates
   - See [VERSION_MANAGEMENT.md](docs/VERSION_MANAGEMENT.md)

2. **Date/Time Usage**:
   - Always use current system date, not hardcoded dates
   - Format: `YYYY-MM-DD` for display, ISO 8601 for timestamps

3. **Virtual Environment**:
   - All Python commands must run inside venv
   - Activate: `source venv/bin/activate`

4. **Testing Strategy**:
   - Only write tests for key modules (ASR, LLM, WebSocket)
   - Don't create separate test programs
   - Integrate tests within the project

## Adding New Features

### Adding a New Application

The project supports multiple apps (VoiceNote, SmartChat, VoiceZen). To add a new one:

1. **Create app directory**:
   ```bash
   cd electron-app/src/components/apps
   mkdir YourNewApp
   ```

2. **Create app component**:
   ```typescript
   // YourNewApp.tsx
   import React from 'react';
   import './YourNewApp.css';
   
   interface YourNewAppProps {
     apiConnected: boolean;
   }
   
   export const YourNewApp: React.FC<YourNewAppProps> = ({ apiConnected }) => {
     return (
       <div className="your-new-app">
         {/* Your app content */}
       </div>
     );
   };
   ```

3. **Update type definitions** in `Sidebar.tsx`:
   ```typescript
   export type AppView = 'voice-note' | 'smart-chat' | 'voice-zen' | 'your-new-app' | 'history' | 'settings';
   ```

4. **Add to sidebar** and **update App.tsx** routing

5. **Update documentation** - Add your app to README.md

See [MULTI_APP_ARCHITECTURE.md](docs/MULTI_APP_ARCHITECTURE.md) for detailed guide.

### Adding a New ASR Provider

1. Create a new file in `src/providers/asr/`
2. Inherit from `ASRProvider` base class (see `src/core/base.py`)
3. Implement required methods:
   - `initialize(config)` - Initialize provider
   - `start_streaming_recognition(language)` - Start streaming ASR
   - `send_audio_chunk(audio_data)` - Send audio data
   - `stop_streaming_recognition()` - Stop and get final result
4. Load in `src/api/server.py`
5. Add configuration in `config.yml`
6. Update documentation

### Adding a New LLM Provider

The project uses **LiteLLM**, which supports 100+ LLM services out of the box.

To use a new LLM:
1. Simply update `config.yml` with your LLM credentials
2. LiteLLM handles the rest automatically

See [LLM_INTEGRATION.md](docs/LLM_INTEGRATION.md) for details.

### Adding a New Storage Provider

1. Create a new file in `src/providers/storage/`
2. Inherit from `StorageProvider` base class
3. Implement required methods:
   - `save_record(text, metadata)` - Save a record
   - `get_record(record_id)` - Retrieve a record
   - `list_records(limit, offset, app_type)` - List records
   - `delete_record(record_id)` - Delete a record
4. Update configuration
5. Update documentation

## Testing

Following the project's testing strategy:

- **Key modules only**: Write tests for ASR, LLM, WebSocket, and storage
- **Integration over unit**: Focus on integration tests for key flows
- **No separate test programs**: Integrate tests within the project structure
- **Manual testing**: Test all three apps (VoiceNote, SmartChat, VoiceZen)
- **Cross-platform**: Test on multiple platforms when possible (macOS, Linux, Windows)

### Testing Checklist

Before submitting a PR:
- [ ] All existing functionality still works
- [ ] New features tested manually
- [ ] No console errors
- [ ] WebSocket connections stable
- [ ] ASR and LLM services respond correctly
- [ ] UI/UX is consistent with existing design

## Documentation

### When to Update Documentation

- **README.md**: Adding new features, changing setup process
- **Code comments**: Complex logic, algorithms, workarounds
- **API documentation**: New endpoints, changed request/response formats
- **Architecture docs**: Significant architectural changes
- **Version**: Update version in `version.ts` and use `update_version.sh` script

### Documentation Guidelines

- Use **Chinese** for code comments in Chinese files
- Use **English** for code comments in shared/library files
- Keep examples **up to date**
- Include **screenshots** for UI changes
- Reference related documents using relative links
- **Only write necessary Markdown documents**: Don't create documentation files unless they provide clear value. Avoid creating redundant or trivial `.md` files

## Key Documentation Files

- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System architecture
- [MULTI_APP_ARCHITECTURE.md](docs/MULTI_APP_ARCHITECTURE.md) - Multi-app guide
- [LLM_INTEGRATION.md](docs/LLM_INTEGRATION.md) - LLM integration
- [VERSION_MANAGEMENT.md](docs/VERSION_MANAGEMENT.md) - Version management
- [OPTIMIZATION_GUIDE.md](docs/OPTIMIZATION_GUIDE.md) - Performance tips

## Getting Help

### Resources

- **Architecture Questions**: Read `docs/ARCHITECTURE.md`
- **Multi-App Questions**: Read `docs/MULTI_APP_ARCHITECTURE.md`
- **LLM Questions**: Read `docs/LLM_INTEGRATION.md`
- **General Questions**: Open a GitHub issue

### Community

- Open an issue for bugs or feature requests
- Start a discussion for general questions
- Submit a PR for code contributions

## Review Process

1. **Automated checks**: Ensure your code follows style guidelines
2. **Manual review**: Maintainers will review your code
3. **Testing**: Test your changes thoroughly
4. **Documentation**: Update relevant documentation
5. **Approval**: At least one maintainer approval required

## Recognition

Contributors will be recognized in:
- Project README
- Release notes
- GitHub contributors page

---

Thank you for contributing to MindVoice! 🎉

**Project**: MindVoice v1.0.0  
**Maintainer**: 深圳王哥 & AI  
**Email**: manwjh@126.com  
**Last Updated**: 2025-12-31

