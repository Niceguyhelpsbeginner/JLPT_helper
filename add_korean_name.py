#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한자 CSV 파일에 한글 이름 컬럼 추가 스크립트
각 한자에 대해 "한 일", "두 이" 형식의 한글 이름을 추가합니다.
"""

import csv
import sys
import re
import io
from typing import Dict, Optional

# Windows 환경에서 UTF-8 출력 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

def get_korean_name_for_kanji(kanji: str) -> Optional[str]:
    """
    한자에 대한 한글 이름을 반환합니다.
    표준 한자 사전 형식: "한 일", "두 이" 등
    """
    # 기본 한자-한글 이름 매핑 (일부 예시)
    # 실제로는 더 포괄적인 사전이 필요하지만, 
    # 파일에 이미 있는 데이터를 활용하거나 웹 API를 사용할 수 있습니다.
    
    # 파일에 이미 있는 데이터를 활용하기 위해
    # 여기서는 한자를 기반으로 한글 이름을 생성하는 로직을 구현합니다.
    # 실제로는 한자 사전 데이터베이스나 API를 사용하는 것이 좋습니다.
    
    # 간단한 예시 매핑 (실제로는 더 많은 데이터가 필요)
    basic_mapping = {
        '一': '한 일',
        '二': '두 이',
        '三': '석 삼',
        '四': '넉 사',
        '五': '다섯 오',
        '六': '여섯 륙',
        '七': '일곱 칠',
        '八': '여덟 팔',
        '九': '아홉 구',
        '十': '열 십',
    }
    
    if kanji in basic_mapping:
        return basic_mapping[kanji]
    
    # 파일에 이미 있는 데이터를 활용하는 방법
    # 여기서는 나중에 파일을 읽으면서 기존 데이터를 활용하겠습니다.
    return None

def extract_korean_name_from_row(row: list) -> Optional[str]:
    """
    CSV 행에서 기존 한글 이름을 추출합니다.
    마지막에서 두 번째 컬럼에 있는 것으로 보입니다.
    """
    if len(row) >= 2:
        # 마지막에서 두 번째 컬럼 확인
        second_last = row[-2] if len(row) >= 2 else None
        if second_last and second_last.strip():
            # 이미 한글 이름이 있는 경우 (예: "한 일", "두 이" 등)
            # JLPT 정보가 아닌지 확인 (JLPT로 시작하지 않는 경우만)
            if not second_last.strip().startswith('JLPT'):
                return second_last.strip()
    return None

def process_csv_file(input_file: str, output_file: str):
    """
    CSV 파일을 읽어서 한글 이름 컬럼을 추가합니다.
    """
    rows = []
    korean_name_map: Dict[str, str] = {}
    
    print(f"[1/3] 파일 읽는 중: {input_file}")
    
    # 첫 번째 패스: 기존 데이터에서 한글 이름 추출
    with open(input_file, 'r', encoding='utf-8-sig') as f:  # BOM 처리
        reader = csv.reader(f)
        for row in reader:
            rows.append(row)
            if len(row) >= 5:
                kanji = row[4]  # 5번째 컬럼 (인덱스 4)
                korean_name = extract_korean_name_from_row(row)
                if kanji and korean_name:
                    # 기존 매핑이 없거나, 더 나은 매핑이 있는 경우 업데이트
                    if kanji not in korean_name_map or korean_name_map[kanji] == "":
                        korean_name_map[kanji] = korean_name
    
    print(f"[2/3] {len(rows)}개 행 읽음")
    print(f"      {len(korean_name_map)}개 한자-한글 이름 매핑 생성")
    
    # 두 번째 패스: 새로운 컬럼 추가
    output_rows = []
    missing_kanji = set()
    added_count = 0
    
    for i, row in enumerate(rows):
        new_row = row.copy()
        
        if len(row) >= 5:
            kanji = row[4]
            if kanji and kanji.strip():
                # 기존 매핑에서 찾기
                korean_name = korean_name_map.get(kanji.strip())
                
                if not korean_name:
                    # 매핑에 없는 경우, 기본 함수로 시도
                    korean_name = get_korean_name_for_kanji(kanji.strip())
                    if not korean_name:
                        missing_kanji.add(kanji.strip())
                        korean_name = ""  # 빈 값으로 설정
                
                # 한글 이름이 있는 경우에만 카운트
                if korean_name:
                    added_count += 1
                
                # 새로운 컬럼을 마지막 컬럼(JLPT 정보) 바로 앞에 추가
                # 기존 한글 이름 컬럼은 그대로 유지하고, 새로운 컬럼을 추가
                # 마지막 컬럼 바로 앞에 추가 (기존 한글 이름이 있어도 새로 추가)
                if len(new_row) > 0:
                    new_row.insert(-1, korean_name)
                else:
                    new_row.append(korean_name)
            else:
                # 한자가 없는 경우 빈 값 추가
                if len(new_row) > 0:
                    new_row.insert(-1, "")
                else:
                    new_row.append("")
        else:
            # 행이 너무 짧은 경우 빈 값 추가
            if len(new_row) > 0:
                new_row.insert(-1, "")
            else:
                new_row.append("")
        
        output_rows.append(new_row)
        
        # 진행 상황 출력 (100줄마다)
        if (i + 1) % 100 == 0:
            print(f"      처리 중: {i + 1}/{len(rows)} 행... ({added_count}개 한글 이름 추가됨)")
    
    if missing_kanji:
        print(f"[경고] 한글 이름을 찾지 못한 한자: {len(missing_kanji)}개")
        if len(missing_kanji) <= 20:
            print(f"       목록: {', '.join(sorted(missing_kanji))}")
        else:
            print(f"       예시: {', '.join(sorted(list(missing_kanji))[:20])}")
    
    # 결과 저장
    print(f"[3/3] 결과 저장 중: {output_file}")
    with open(output_file, 'w', encoding='utf-8-sig', newline='') as f:  # BOM 추가
        writer = csv.writer(f)
        writer.writerows(output_rows)
    
    print(f"[완료] {len(output_rows)}개 행 처리됨 ({added_count}개 한글 이름 추가됨)")

if __name__ == "__main__":
    input_file = "Heisigs RTK 6th Edition Korean.csv"
    # 원본 파일에 직접 추가 (백업 파일 생성)
    backup_file = "Heisigs RTK 6th Edition Korean_backup.csv"
    output_file = input_file  # 원본 파일에 직접 저장
    
    import shutil
    import os
    
    try:
        # 백업 파일 생성
        if os.path.exists(input_file):
            shutil.copy2(input_file, backup_file)
            print(f"[백업] 원본 파일 백업: {backup_file}")
        
        process_csv_file(input_file, output_file)
        print(f"\n[성공] 원본 파일에 한글 이름 컬럼이 추가되었습니다: {input_file}")
        print(f"       백업 파일: {backup_file}")
    except Exception as e:
        print(f"[오류] {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
