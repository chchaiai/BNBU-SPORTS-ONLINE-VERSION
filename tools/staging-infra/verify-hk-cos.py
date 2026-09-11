#!/usr/bin/env python3
"""Run on the authorized HK CVM. Never print credentials or signed URLs.

Creates uniquely named synthetic probes. Roster probes are cleaned up; one tiny
media probe is retained because the Backend policy intentionally denies deletion.
Requires distribution package python3-boto3.
"""
import hashlib
import json
import socket
import time
import urllib.error
import urllib.request
import uuid

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

BUCKET = "bnbu-sports-prod-hk-1443273655"
REGION = "ap-hongkong"
ROLE = "BNBUSportsHKCVMRole"
DOMAIN = f"{BUCKET}.cos.{REGION}.myqcloud.com"
META = "http://metadata.tencentyun.com/latest/meta-data/cam/security-credentials/"
RESULTS = []


def result(name, passed, **details):
    RESULTS.append({"check": name, "status": "PASS" if passed else "FAIL", **details})


def request(url, method="GET", data=None, headers=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers or {}, method=method), timeout=15) as response:
            return response.status, response.read(), dict(response.headers)
    except urllib.error.HTTPError as error:
        return error.code, b"", dict(error.headers)


def denied(name, operation):
    try:
        operation()
        result(name, False, reason="unexpected_authorization")
    except ClientError as error:
        code = error.response["ResponseMetadata"]["HTTPStatusCode"]
        result(name, code == 403, http=code)


def main():
    role_status, role_body, _ = request(META)
    if role_status != 200 or role_body.decode().strip() != ROLE:
        result("instance_role", False, http=role_status)
        return
    _, credential_body, _ = request(META + ROLE)
    credential = json.loads(credential_body)
    required = ("TmpSecretId", "TmpSecretKey", "Token")
    if not all(credential.get(key) for key in required):
        result("temporary_credentials", False)
        return
    result("temporary_credentials", True, role=ROLE)
    client = boto3.client("s3", region_name=REGION, endpoint_url=f"https://cos.{REGION}.myqcloud.com",
        aws_access_key_id=credential["TmpSecretId"], aws_secret_access_key=credential["TmpSecretKey"],
        aws_session_token=credential["Token"], config=Config(signature_version="s3v4", retries={"max_attempts": 1},
        connect_timeout=5, read_timeout=15, s3={"addressing_style": "virtual"}))
    result("cos_dns", True, addresses=sorted({x[4][0] for x in socket.getaddrinfo(DOMAIN, 443, socket.AF_INET)}))
    client.head_bucket(Bucket=BUCKET)
    result("head_bucket", True)
    nonce = uuid.uuid4().hex
    roster = f"roster-sources/infra-verification/{nonce}.txt"
    media = f"media/infra-verification/{nonce}.txt"
    payload = b"BNBU Hong Kong staging infrastructure verification: synthetic data only.\n"
    digest = hashlib.sha256(payload).hexdigest()
    multipart_id = None
    try:
        url = client.generate_presigned_url("put_object", Params={"Bucket": BUCKET, "Key": roster, "ContentType": "text/plain"}, ExpiresIn=300)
        status, _, _ = request(url, "PUT", payload, {"Content-Type": "text/plain"})
        result("presigned_put", status == 200, http=status)
        content = client.get_object(Bucket=BUCKET, Key=roster)["Body"].read()
        result("get_checksum", hashlib.sha256(content).hexdigest() == digest)
        head = client.head_object(Bucket=BUCKET, Key=roster)
        encryption = head["ResponseMetadata"]["HTTPHeaders"].get("x-cos-server-side-encryption", head.get("ServerSideEncryption"))
        result("default_encryption", encryption == "AES256", algorithm=encryption)
        status, _, _ = request(f"https://{DOMAIN}/{roster}")
        result("anonymous_object_denied", status == 403, http=status)
        signed_get = client.generate_presigned_url("get_object", Params={"Bucket": BUCKET, "Key": roster}, ExpiresIn=300)
        status, body, _ = request(signed_get)
        result("presigned_get", status == 200 and body == payload, http=status)
        for origin in ("https://www.student.bnbusports.cn", "https://www.teacher.bnbusports.cn", "https://unknown.invalid", "https://www.verityai.cn", "http://www.student.bnbusports.cn"):
            status, _, headers = request(f"https://{DOMAIN}/{roster}", "OPTIONS", headers={"Origin": origin, "Access-Control-Request-Method": "PUT", "Access-Control-Request-Headers": "content-type"})
            normalized = {k.lower(): v for k, v in headers.items()}
            allowed = origin in ("https://www.student.bnbusports.cn", "https://www.teacher.bnbusports.cn")
            result("cors_preflight", (status == 200 and normalized.get("access-control-allow-origin") == origin) if allowed else "access-control-allow-origin" not in normalized, origin=origin, http=status)
        client.put_object(Bucket=BUCKET, Key=media, Body=payload, ContentType="text/plain")
        result("media_put_get", client.get_object(Bucket=BUCKET, Key=media)["Body"].read() == payload, retained_synthetic_object=media, bytes=len(payload))
        denied("media_delete_denied", lambda: client.delete_object(Bucket=BUCKET, Key=media))
        denied("bucket_list_denied", lambda: client.list_objects_v2(Bucket=BUCKET, MaxKeys=1))
        denied("outside_prefix_put_denied", lambda: client.put_object(Bucket=BUCKET, Key=f"infra-forbidden/{nonce}.txt", Body=payload))
        multipart_id = client.create_multipart_upload(Bucket=BUCKET, Key=roster)["UploadId"]
        part = client.upload_part(Bucket=BUCKET, Key=roster, UploadId=multipart_id, PartNumber=1, Body=payload)
        client.complete_multipart_upload(Bucket=BUCKET, Key=roster, UploadId=multipart_id, MultipartUpload={"Parts": [{"PartNumber": 1, "ETag": part["ETag"]}]})
        multipart_id = None
        result("multipart_roundtrip", client.get_object(Bucket=BUCKET, Key=roster)["Body"].read() == payload)
    finally:
        if multipart_id:
            client.abort_multipart_upload(Bucket=BUCKET, Key=roster, UploadId=multipart_id)
        client.delete_object(Bucket=BUCKET, Key=roster)
        try:
            client.head_object(Bucket=BUCKET, Key=roster)
            result("roster_probe_cleanup", False)
        except ClientError as error:
            code = error.response["ResponseMetadata"]["HTTPStatusCode"]
            result("roster_probe_cleanup", code == 404, http=code)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Exception text may contain URLs/tokens, so only emit its class.
        result("execution", False, error_type=type(error).__name__)
    print(json.dumps({"utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": RESULTS}, indent=2))
    raise SystemExit(1 if any(row["status"] != "PASS" for row in RESULTS) else 0)
