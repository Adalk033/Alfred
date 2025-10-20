import logging
import os
from logging.handlers import TimedRotatingFileHandler
from utils.paths import get_log_path

def get_logger(name):
    # En modo desarrollo, todos los logs van a general.logs
    # En producción, cada módulo tiene su propio archivo
    is_dev_mode = os.getenv('ALFRED_DEV_MODE', '').lower() == '1'
    
    if is_dev_mode:
        log_filename = "general.logs"
    else:
        log_filename = f"{name}.log"
    
    log_path = get_log_path() / log_filename
    handler = TimedRotatingFileHandler(log_path, when="midnight", backupCount=7, encoding="utf-8")
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s")
    handler.setFormatter(formatter)

    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
