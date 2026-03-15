from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr
import os
import secrets
import smtplib
import ssl


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_registration_code_expiry_minutes() -> int:
    raw_value = os.getenv("REGISTRATION_CODE_EXPIRE_MINUTES", "10")
    try:
        minutes = int(raw_value)
    except ValueError as exc:
        raise RuntimeError("REGISTRATION_CODE_EXPIRE_MINUTES deve essere un intero valido") from exc
    if minutes <= 0:
        raise RuntimeError("REGISTRATION_CODE_EXPIRE_MINUTES deve essere maggiore di zero")
    return minutes


def generate_verification_code(length: int = 6) -> str:
    upper_bound = 10 ** length
    return f"{secrets.randbelow(upper_bound):0{length}d}"


def send_registration_verification_email(recipient_email: str, verification_code: str, expires_at: datetime) -> None:
    smtp_host = os.getenv("SMTP_HOST")
    smtp_from_email = os.getenv("SMTP_FROM_EMAIL")
    if not smtp_host or not smtp_from_email:
        raise RuntimeError("Configurazione SMTP incompleta: imposta almeno SMTP_HOST e SMTP_FROM_EMAIL")

    smtp_port = int(os.getenv("SMTP_PORT", "465"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_use_tls = _env_bool("SMTP_USE_TLS", True)
    smtp_use_ssl = _env_bool("SMTP_USE_SSL", False)
    smtp_from_name = os.getenv("SMTP_FROM_NAME", "MealPlan Pro")

    message = EmailMessage()
    message["Subject"] = "Codice di verifica MealPlan Pro"
    message["From"] = formataddr((smtp_from_name, smtp_from_email))
    message["To"] = recipient_email
    text_message = [
            "Ciao,",
            "",
            "per completare la registrazione su MealPlan Pro usa questo codice di verifica:",
            "",
            verification_code,
            "",
            f"Il codice scade alle {expires_at.strftime('%H:%M')} UTC.",
            "Se non hai richiesto questa registrazione, puoi ignorare questa email.",
        ]
    message.set_content("\n".join(text_message))

    if smtp_use_ssl:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ssl.create_default_context()) as server:
            if smtp_username and smtp_password:
                server.login(smtp_username, smtp_password)
            server.send_message(message)
        return

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        if smtp_use_tls:
            server.starttls(context=ssl.create_default_context())
        if smtp_username and smtp_password:
            server.login(smtp_username, smtp_password)
        server.send_message(message)
