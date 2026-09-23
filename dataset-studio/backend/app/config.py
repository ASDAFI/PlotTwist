from dataclasses import dataclass
from pathlib import Path
import os

@dataclass(frozen=True)
class Settings:
    dataset_root: Path
    responses_root: Path
    exports_root: Path
    state_root: Path
    max_json_bytes: int = 10 * 1024 * 1024
    max_response_line_bytes: int = 8 * 1024 * 1024

    @classmethod
    def from_env(cls):
        root = Path(__file__).resolve().parents[2]
        return cls(*(Path(os.environ.get(name, str(default))).expanduser().resolve() for name, default in [
            ('DATASET_ROOT', root / 'examples/dataset'),
            ('RESPONSES_ROOT', root / 'examples/responses'),
            ('EXPORTS_ROOT', root / 'exports'),
            ('STATE_ROOT', root / '.plottwist'),
        ]))

    def prepare(self):
        for name, root in [('dataset', self.dataset_root), ('responses', self.responses_root)]:
            if not root.is_dir():
                raise RuntimeError(f'The configured {name} directory does not exist. Check your mounts.')
        for writable in [self.exports_root, self.state_root]:
            for source in [self.dataset_root, self.responses_root]:
                if writable == source or writable.is_relative_to(source) or source.is_relative_to(writable):
                    raise RuntimeError('Export/state roots must be separate from input roots, without ancestor overlap.')
            writable.mkdir(parents=True, exist_ok=True)
        if self.exports_root == self.state_root or self.state_root.is_relative_to(self.exports_root) or self.exports_root.is_relative_to(self.state_root):
            raise RuntimeError('State and export roots must not overlap.')
