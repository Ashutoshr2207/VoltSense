"""Compatibility entrypoint for the explicit, non-overwriting training CLI.

Use: python audit_pipeline.py inspect --dataset PATH
No training, dataset loading, or report rewriting occurs on import.
"""
from training import main

if __name__ == '__main__':
    main()
