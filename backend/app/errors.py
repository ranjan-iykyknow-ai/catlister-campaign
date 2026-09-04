class AppError(Exception):
    def __init__(self, status: int, code: str, message: str, details=None):
        self.status = status
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)


def error_content(code: str, message: str, details=None):
    return {"error": {"code": code, "message": message, "details": details}}
