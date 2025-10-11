import logging
from logging.handlers import TimedRotatingFileHandler
from utils.paths import get_log_path

def get_logger(name):
    log_path = get_log_path() / f"{name}.log"
    handler = TimedRotatingFileHandler(log_path, when="midnight", backupCount=7, encoding="utf-8")
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")
    handler.setFormatter(formatter)

    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
